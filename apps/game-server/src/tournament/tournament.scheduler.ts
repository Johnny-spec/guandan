import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { TournamentService, TournamentError } from './tournament.service.js';
import { TOURNAMENT_REPOSITORY, type TournamentRepository } from './tournament.repository.js';

/**
 * Phase 4 Sprint 2 · 赛事自动开局 / 自动取消调度器。
 *
 * 触发条件（按优先级评估，先匹配先执行，每个 tournament 每 tick 至多 1 个动作）：
 *   1. 状态 OPEN 且 `registrationClosesAt` 已过 + 活跃报名 ≥ 2 → AUTO_START
 *   2. 状态 OPEN 且 `registrationClosesAt` 已过 + 活跃报名 < 2 → AUTO_CANCEL（理由 NOT_ENOUGH_ENTRIES）
 *   3. 状态 OPEN 且活跃报名达到 `maxTeams` → AUTO_START（提前满员）
 *
 * 设计要点：
 * - `tickOnce(now)` 是纯方法，便于单测；线上 `onModuleInit` 用 `setInterval` 周期触发。
 * - 内部维护一个有上限的 action ring buffer，供 `GET /scheduler/recent` 端点和运维排障使用。
 * - 所有 service 调用都做 try/catch；单个 tournament 失败不影响其他 tournament 在本 tick 内被处理。
 * - 通过 `enableInterval` 选项关掉自动定时器，避免测试中 Nest 启动后挂着 handle。
 */

export interface Clock {
  now(): Date;
}

export const SCHEDULER_CLOCK = Symbol('SCHEDULER_CLOCK');
export const SCHEDULER_OPTIONS = Symbol('SCHEDULER_OPTIONS');

export interface TournamentSchedulerOptions {
  /** 自动 tick 间隔（ms）。默认 30_000。 */
  intervalMs?: number;
  /** 是否在 onModuleInit 时启动 setInterval（test 默认 false）。 */
  enableInterval?: boolean;
  /** ring buffer 大小，默认 200。 */
  historySize?: number;
}

export type SchedulerActionKind = 'AUTO_START' | 'AUTO_CANCEL' | 'NO_OP' | 'ERROR';

export interface SchedulerAction {
  tournamentId: string;
  kind: SchedulerActionKind;
  reason: string;
  at: string;
}

export interface SchedulerTickResult {
  at: string;
  scanned: number;
  actions: SchedulerAction[];
}

@Injectable()
export class TournamentScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly history: SchedulerAction[] = [];
  private readonly intervalMs: number;
  private readonly enableInterval: boolean;
  private readonly historySize: number;

  constructor(
    @Inject(TournamentService) private readonly svc: TournamentService,
    @Inject(TOURNAMENT_REPOSITORY) private readonly repo: TournamentRepository,
    @Optional() @Inject(SCHEDULER_CLOCK) private readonly clock?: Clock,
    @Optional() @Inject(SCHEDULER_OPTIONS) options?: TournamentSchedulerOptions,
  ) {
    this.intervalMs = options?.intervalMs ?? 30_000;
    this.enableInterval = options?.enableInterval ?? false;
    this.historySize = options?.historySize ?? 200;
  }

  onModuleInit(): void {
    if (this.enableInterval) {
      this.timer = setInterval(() => {
        try {
          this.tickOnce();
        } catch {
          // 兜底吞错；任何单 tournament 的异常已在 tickOnce 内被记录。
        }
      }, this.intervalMs);
      // 不阻塞 Node 进程退出（本进程是 game-server，不需要 keepalive 这个 timer）。
      if (typeof this.timer.unref === 'function') this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 执行一次调度扫描；返回本轮所有被采纳的动作。
   * @param explicitNow 测试可以注入固定时刻；否则使用 clock.now() / Date.now()。
   */
  tickOnce(explicitNow?: Date): SchedulerTickResult {
    const now = explicitNow ?? this.clock?.now() ?? new Date();
    const nowIso = now.toISOString();
    const open = this.repo.listTournaments({ status: 'OPEN' });
    const actions: SchedulerAction[] = [];
    for (const t of open) {
      const action = this.evaluateAndApply(t.id, now);
      if (action) {
        actions.push(action);
        this.pushHistory(action);
      }
    }
    return { at: nowIso, scanned: open.length, actions };
  }

  recentActions(limit = 50): SchedulerAction[] {
    const start = Math.max(0, this.history.length - limit);
    return this.history.slice(start);
  }

  /** 单 tournament 决策；抽出来便于直接复用做单元测试。 */
  evaluateAndApply(tournamentId: string, now: Date): SchedulerAction | null {
    const t = this.repo.getTournament(tournamentId);
    if (!t || t.status !== 'OPEN') return null;
    const activeEntries = this.repo
      .listEntries(tournamentId)
      .filter((e) => e.status === 'CONFIRMED' || e.status === 'PENDING');

    const closesAt = t.registrationClosesAt ? new Date(t.registrationClosesAt) : null;
    const expired = closesAt != null && !Number.isNaN(closesAt.getTime()) && now.getTime() >= closesAt.getTime();
    const full = activeEntries.length >= t.maxTeams;

    let kind: SchedulerActionKind | null = null;
    let reason = '';

    if (expired && activeEntries.length >= 2) {
      kind = 'AUTO_START';
      reason = `registration deadline passed (${t.registrationClosesAt}); ${activeEntries.length} entries`;
    } else if (expired && activeEntries.length < 2) {
      kind = 'AUTO_CANCEL';
      reason = `registration deadline passed (${t.registrationClosesAt}); only ${activeEntries.length} entries`;
    } else if (full) {
      kind = 'AUTO_START';
      reason = `tournament full (${activeEntries.length}/${t.maxTeams})`;
    }

    if (kind == null) return null;

    const nowIso = now.toISOString();
    try {
      if (kind === 'AUTO_START') {
        this.svc.startTournament(tournamentId);
      } else if (kind === 'AUTO_CANCEL') {
        this.svc.cancelTournament(tournamentId);
      }
      return { tournamentId, kind, reason, at: nowIso };
    } catch (err) {
      const msg =
        err instanceof TournamentError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      return { tournamentId, kind: 'ERROR', reason: `${kind} failed: ${msg}`, at: nowIso };
    }
  }

  private pushHistory(action: SchedulerAction): void {
    this.history.push(action);
    if (this.history.length > this.historySize) {
      this.history.splice(0, this.history.length - this.historySize);
    }
  }
}
