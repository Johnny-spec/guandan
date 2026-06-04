import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { InMemoryReplayStore, REPLAY_STORE, type ReplayStore } from './replay.store.js';

type PayloadFor<K extends ReplayEventKind> = Extract<ReplayEvent, { kind: K }>['payload'];

/**
 * 回放日志。
 *
 * 默认走 `InMemoryReplayStore`；通过 Nest DI 可替换为 `JsonlReplayStore`（文件持久化）
 * 或未来的 `PrismaReplayStore`（Postgres）。
 *
 * 不变量：
 *   - 单 matchId 的 events 按 append 顺序天然单调，`seq` = index+1
 *   - match_finish 后仍允许 append（兼容裁判事后注释 / 系统补录）；`meta.finishedAtMs`
 *     取首次 match_finish 事件的 `tsMs`，由 list 派生
 */
@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private readonly store: ReplayStore;

  constructor(@Optional() @Inject(REPLAY_STORE) store?: ReplayStore) {
    this.store = store ?? new InMemoryReplayStore();
  }

  append<K extends ReplayEventKind>(matchId: string, kind: K, payload: PayloadFor<K>): ReplayEvent {
    if (!matchId) {
      throw new Error('[replay] append called with empty matchId');
    }
    const existing = this.store.list(matchId);
    const evt = {
      matchId,
      seq: existing.length + 1,
      tsMs: Date.now(),
      kind,
      payload,
    } as ReplayEvent;
    this.store.append(matchId, evt);
    return evt;
  }

  list(matchId: string): readonly ReplayEvent[] {
    return this.store.list(matchId);
  }

  meta(matchId: string): ReplayMeta {
    const list = this.store.list(matchId);
    const first = list[0];
    let finishedAtMs: number | null = null;
    for (const e of list) {
      if (e.kind === 'match_finish') {
        finishedAtMs = e.tsMs;
        break;
      }
    }
    return {
      matchId,
      startedAtMs: first?.kind === 'match_start' ? first.tsMs : (first?.tsMs ?? null),
      finishedAtMs,
      eventCount: list.length,
    };
  }

  /** 仅测试 / dev 重置。 */
  clear(matchId?: string): void {
    this.store.clear(matchId);
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
