import { Injectable, Logger } from '@nestjs/common';
import type {
  MatchFinishPayload,
  MatchStartPayload,
  PassPayload,
  PlayPayload,
  ReplayEvent,
  ReplayEventKind,
  ReplayMeta,
  TrickClosedPayload,
} from './replay.types.js';

type PayloadFor<K extends ReplayEventKind> = Extract<ReplayEvent, { kind: K }>['payload'];

/**
 * 内存版回放日志。
 *
 * Sprint 2/3 阶段够用；Phase 3 后期接 Postgres 时实现 `PrismaReplayRepository`，
 * 接口保持 `append / list / meta / clear` 不变。
 *
 * 不变量：
 *   - 单 matchId 的 `events` 按 append 顺序天然单调，`seq` = index+1
 *   - match_finish 后仍允许 append（兼容裁判事后注释 / 系统补录），但 `meta.finishedAtMs` 锁定在首次 match_finish
 */
@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private readonly events = new Map<string, ReplayEvent[]>();
  /** matchId → 首次 match_finish 的时间戳，幂等记录。 */
  private readonly finishedAt = new Map<string, number>();

  append<K extends ReplayEventKind>(matchId: string, kind: K, payload: PayloadFor<K>): ReplayEvent {
    if (!matchId) {
      throw new Error('[replay] append called with empty matchId');
    }
    const list = this.events.get(matchId) ?? [];
    const evt = {
      matchId,
      seq: list.length + 1,
      tsMs: Date.now(),
      kind,
      payload,
    } as ReplayEvent;
    list.push(evt);
    this.events.set(matchId, list);
    if (kind === 'match_finish' && !this.finishedAt.has(matchId)) {
      this.finishedAt.set(matchId, evt.tsMs);
    }
    return evt;
  }

  list(matchId: string): readonly ReplayEvent[] {
    return this.events.get(matchId) ?? [];
  }

  meta(matchId: string): ReplayMeta {
    const list = this.events.get(matchId) ?? [];
    const first = list[0];
    return {
      matchId,
      startedAtMs: first?.kind === 'match_start' ? first.tsMs : (first?.tsMs ?? null),
      finishedAtMs: this.finishedAt.get(matchId) ?? null,
      eventCount: list.length,
    };
  }

  /** 仅测试 / dev 重置。 */
  clear(matchId?: string): void {
    if (matchId) {
      this.events.delete(matchId);
      this.finishedAt.delete(matchId);
    } else {
      this.events.clear();
      this.finishedAt.clear();
    }
  }

  // ----- 语义糖（用于 Gateway / MatchService 调用更可读）-----
  recordMatchStart(matchId: string, payload: MatchStartPayload): void {
    this.append(matchId, 'match_start', payload);
  }
  recordPlay(matchId: string, payload: PlayPayload): void {
    this.append(matchId, 'play', payload);
  }
  recordPass(matchId: string, payload: PassPayload): void {
    this.append(matchId, 'pass', payload);
  }
  recordTrickClosed(matchId: string, payload: TrickClosedPayload): void {
    this.append(matchId, 'trick_closed', payload);
  }
  recordMatchFinish(matchId: string, payload: MatchFinishPayload): void {
    this.append(matchId, 'match_finish', payload);
  }
}
