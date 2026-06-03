import { GAME_SERVER_URL } from './dev-token';

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; code: string; message: string };
type Envelope<T> = Ok<T> | Err;

async function getJson<T>(path: string): Promise<Envelope<T>> {
  try {
    const r = await fetch(`${GAME_SERVER_URL}${path}`, { cache: 'no-store' });
    if (!r.ok && r.status !== 404) {
      return { ok: false, code: `HTTP_${r.status}`, message: r.statusText };
    }
    const j = (await r.json()) as Envelope<T>;
    return j;
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error).message };
  }
}

export interface TierDto {
  key: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'grandmaster';
  label: string;
  color: string;
  rating: number;
  nextTier: TierDto['key'] | null;
  ratingToNext: number | null;
  progress: number;
}

export interface UserDto {
  id: string;
  displayName: string;
  isBot: boolean;
  rating: number;
  matchesTotal: number;
  matchesWon: number;
  lastSeenAt: string;
  tier?: TierDto;
}

export interface MatchDto {
  id: string;
  roomId: string;
  kind: 'CASUAL' | 'RANKED' | 'AI_TRAINING' | 'TOURNAMENT';
  result: 'PENDING' | 'COMPLETED' | 'ABORTED';
  winnerTeam: 'NS' | 'EW' | null;
  startLevel: string;
  endLevel: string | null;
  hasAiPlayers: boolean;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  players: {
    userId: string;
    displayName: string;
    seat: 'N' | 'E' | 'S' | 'W';
    team: 'NS' | 'EW';
    isBot: boolean;
    botDifficulty?: 'easy' | 'normal' | 'hard';
    finishOrder?: number;
    ratingBefore?: number;
    ratingAfter?: number;
    ratingDelta?: number;
  }[];
}

export interface LeaderboardDto {
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
  matchesTotal: number;
  matchesWon: number;
  tier?: TierDto;
}

export interface MatchesPageDto {
  items: MatchDto[];
  nextCursor: string | null;
  total: number;
}

export interface ReplayMetaDto {
  matchId: string;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  eventCount: number;
}

export interface ReplayEventDto {
  matchId: string;
  seq: number;
  tsMs: number;
  kind: 'match_start' | 'play' | 'pass' | 'trick_closed' | 'match_finish';
  // payload 形态见后端 replay.types.ts；前端按 kind 分支取
  payload: Record<string, unknown>;
}

export interface ReplayBundleDto {
  meta: ReplayMetaDto;
  events: ReplayEventDto[];
}

export const api = {
  getUser: (id: string) => getJson<UserDto>(`/api/v1/users/${encodeURIComponent(id)}`),
  listMatches: (userId: string, limit = 20) =>
    getJson<MatchDto[]>(`/api/v1/matches?userId=${encodeURIComponent(userId)}&limit=${limit}`),
  queryMatches: (
    userId: string,
    opts: { limit?: number; cursor?: string | null; since?: string | null; until?: string | null; completedOnly?: boolean } = {},
  ) => {
    const params = new URLSearchParams({ userId, limit: String(opts.limit ?? 20) });
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.since) params.set('since', opts.since);
    if (opts.until) params.set('until', opts.until);
    // 关键：始终带 completedOnly（即便 false），让后端进入 page 模式而非 list 模式
    params.set('completedOnly', opts.completedOnly ? 'true' : 'false');
    return getJson<MatchesPageDto>(`/api/v1/matches?${params.toString()}`);
  },
  leaderboard: (limit = 50) => getJson<LeaderboardDto[]>(`/api/v1/leaderboard?limit=${limit}`),
  getReplay: (matchId: string) =>
    getJson<ReplayBundleDto>(`/api/v1/matches/${encodeURIComponent(matchId)}/replay`),
};
