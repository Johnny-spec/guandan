import type { Seat } from '@teams-guandan/shared-types';
import type { Team } from '../match/match.repository.js';

/**
 * 回放事件类型。
 *
 * 设计原则：
 *   - 只记录"已发生的事实"（emit 之后追加），不记录"意图"
 *   - 每个事件 payload 纯数据，无对象引用 —— 便于序列化到 Postgres / 转发给观战
 *   - seq 在单个 matchId 内单调递增，作为回放定序键
 */
export type ReplayEventKind =
  | 'match_start'
  | 'play'
  | 'pass'
  | 'trick_closed'
  | 'match_finish';

export interface ReplayEventBase {
  matchId: string;
  seq: number;
  tsMs: number;
  kind: ReplayEventKind;
}

export interface MatchStartPayload {
  roomId: string;
  startLevel: string;
  seats: Array<{ userId: string; displayName: string; seat: Seat; isBot: boolean }>;
}

export interface PlayPayload {
  seat: Seat;
  cardIds: string[];
}

export interface PassPayload {
  seat: Seat;
}

export interface TrickClosedPayload {
  lead: Seat;
}

export interface MatchFinishPayload {
  winnerTeam: Team;
  finishedOrder: Seat[];
  endLevel: string;
  durationMs: number;
}

export type ReplayEvent =
  | (ReplayEventBase & { kind: 'match_start'; payload: MatchStartPayload })
  | (ReplayEventBase & { kind: 'play'; payload: PlayPayload })
  | (ReplayEventBase & { kind: 'pass'; payload: PassPayload })
  | (ReplayEventBase & { kind: 'trick_closed'; payload: TrickClosedPayload })
  | (ReplayEventBase & { kind: 'match_finish'; payload: MatchFinishPayload });

export interface ReplayMeta {
  matchId: string;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  eventCount: number;
}
