import { Injectable } from '@nestjs/common';
import type { Seat } from '@teams-guandan/shared-types';

export type Team = 'NS' | 'EW';
export type MatchKind = 'CASUAL' | 'RANKED' | 'AI_TRAINING' | 'TOURNAMENT';
export type MatchResult = 'PENDING' | 'COMPLETED' | 'ABORTED';

export interface MatchPlayerRecord {
  userId: string;
  displayName: string;
  seat: Seat;
  team: Team;
  isBot: boolean;
  botDifficulty?: 'easy' | 'normal' | 'hard';
  finishOrder?: number;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingDelta?: number;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  kind: MatchKind;
  result: MatchResult;
  winnerTeam: Team | null;
  startLevel: string;
  endLevel: string | null;
  hasAiPlayers: boolean;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  players: MatchPlayerRecord[];
}

export interface UserRecord {
  id: string;
  displayName: string;
  isBot: boolean;
  rating: number;
  matchesTotal: number;
  matchesWon: number;
  lastSeenAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
  matchesTotal: number;
  matchesWon: number;
}

/**
 * 仓储接口（与 Prisma schema 对齐）。Phase 2 Sprint 1 用 InMemory 实现，
 * Sprint 2 加 PrismaMatchRepository 替换；接口保持不变。
 */
export interface MatchRepository {
  upsertUser(u: Pick<UserRecord, 'id' | 'displayName' | 'isBot'>): UserRecord;
  getUser(id: string): UserRecord | null;
  setUserRating(id: string, rating: number): void;
  incUserStats(id: string, won: boolean): void;
  createMatch(m: Omit<MatchRecord, 'id'> & { id?: string }): MatchRecord;
  finishMatch(
    id: string,
    patch: Pick<
      MatchRecord,
      'result' | 'winnerTeam' | 'endLevel' | 'durationMs' | 'finishedAt' | 'players'
    >,
  ): MatchRecord | null;
  getMatch(id: string): MatchRecord | null;
  listMatchesByUser(userId: string, limit: number): MatchRecord[];
  listLeaderboard(limit: number): LeaderboardEntry[];
  /** 仅给测试用：清空所有状态。 */
  reset(): void;
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Injectable()
export class InMemoryMatchRepository implements MatchRepository {
  private users = new Map<string, UserRecord>();
  private matches = new Map<string, MatchRecord>();
  /** 最近开始的对局在前（用于"最近 N 场"查询）。 */
  private order: string[] = [];

  upsertUser(u: Pick<UserRecord, 'id' | 'displayName' | 'isBot'>): UserRecord {
    const existing = this.users.get(u.id);
    if (existing) {
      existing.displayName = u.displayName;
      existing.lastSeenAt = new Date().toISOString();
      return existing;
    }
    const rec: UserRecord = {
      id: u.id,
      displayName: u.displayName,
      isBot: u.isBot,
      rating: 1000,
      matchesTotal: 0,
      matchesWon: 0,
      lastSeenAt: new Date().toISOString(),
    };
    this.users.set(u.id, rec);
    return rec;
  }

  getUser(id: string): UserRecord | null {
    return this.users.get(id) ?? null;
  }

  setUserRating(id: string, rating: number): void {
    const u = this.users.get(id);
    if (u) u.rating = rating;
  }

  incUserStats(id: string, won: boolean): void {
    const u = this.users.get(id);
    if (!u) return;
    u.matchesTotal += 1;
    if (won) u.matchesWon += 1;
  }

  createMatch(m: Omit<MatchRecord, 'id'> & { id?: string }): MatchRecord {
    const id = m.id ?? makeId();
    const rec: MatchRecord = { ...m, id };
    this.matches.set(id, rec);
    this.order.unshift(id);
    return rec;
  }

  finishMatch(
    id: string,
    patch: Pick<
      MatchRecord,
      'result' | 'winnerTeam' | 'endLevel' | 'durationMs' | 'finishedAt' | 'players'
    >,
  ): MatchRecord | null {
    const rec = this.matches.get(id);
    if (!rec) return null;
    rec.result = patch.result;
    rec.winnerTeam = patch.winnerTeam;
    rec.endLevel = patch.endLevel;
    rec.durationMs = patch.durationMs;
    rec.finishedAt = patch.finishedAt;
    rec.players = patch.players;
    return rec;
  }

  getMatch(id: string): MatchRecord | null {
    return this.matches.get(id) ?? null;
  }

  listMatchesByUser(userId: string, limit: number): MatchRecord[] {
    const out: MatchRecord[] = [];
    for (const id of this.order) {
      const m = this.matches.get(id);
      if (!m) continue;
      if (m.players.some((p) => p.userId === userId)) {
        out.push(m);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  listLeaderboard(limit: number): LeaderboardEntry[] {
    const eligible = [...this.users.values()].filter((u) => !u.isBot && u.matchesTotal > 0);
    eligible.sort((a, b) => b.rating - a.rating || b.matchesWon - a.matchesWon);
    return eligible.slice(0, limit).map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: u.displayName,
      rating: u.rating,
      matchesTotal: u.matchesTotal,
      matchesWon: u.matchesWon,
    }));
  }

  reset(): void {
    this.users.clear();
    this.matches.clear();
    this.order = [];
  }
}

export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');
