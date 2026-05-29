import type { GameLevel, GamePhase, PlayerSnapshot, Seat } from './game.js';

export type RoomVisibility = 'public' | 'private' | 'team-channel';

export interface RoomSummary {
  id: string;
  hostUserId: string;
  visibility: RoomVisibility;
  /** Teams channel id, 若为 team-channel 房间。 */
  teamsChannelId?: string;
  seats: Partial<Record<Seat, string | null>>;
  spectatorIds: string[];
  level: GameLevel;
  phase: GamePhase;
  createdAt: string;
}

export interface RoomDetail extends RoomSummary {
  players: PlayerSnapshot[];
}
