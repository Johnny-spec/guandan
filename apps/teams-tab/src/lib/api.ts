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

export const api = {
  getUser: (id: string) => getJson<UserDto>(`/api/v1/users/${encodeURIComponent(id)}`),
  listMatches: (userId: string, limit = 20) =>
    getJson<MatchDto[]>(`/api/v1/matches?userId=${encodeURIComponent(userId)}&limit=${limit}`),
  leaderboard: (limit = 50) => getJson<LeaderboardDto[]>(`/api/v1/leaderboard?limit=${limit}`),
};
