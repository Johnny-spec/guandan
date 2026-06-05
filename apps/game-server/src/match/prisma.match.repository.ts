import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  LeaderboardEntry,
  MatchPlayerRecord,
  MatchRecord,
  MatchesPage,
  MatchesQuery,
  RatingEventRecord,
  Team,
  UserRecord,
} from './match.repository.js';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

/**
 * `MatchRepository` 的 Prisma 异步孪生接口。
 *
 * 既有 `MatchRepository` 是同步的（内存仓储遗留），Prisma 必然异步。
 * 本接口逐字段镜像，仅把返回值包成 `Promise`，便于上层调用方按需迁移：
 *   - 短期：MatchService 仍依赖同步 InMemoryMatchRepository（默认 provider）
 *   - 中期：暴露 AsyncMatchRepository token，新调用方直接用 await
 *   - 长期：替换 MatchService 内部依赖为 AsyncMatchRepository
 */
export interface AsyncMatchRepository {
  upsertUser(u: Pick<UserRecord, 'id' | 'displayName' | 'isBot'>): Promise<UserRecord>;
  getUser(id: string): Promise<UserRecord | null>;
  setUserRating(id: string, rating: number): Promise<void>;
  incUserStats(id: string, won: boolean): Promise<void>;
  createMatch(m: Omit<MatchRecord, 'id'> & { id?: string }): Promise<MatchRecord>;
  finishMatch(
    id: string,
    patch: Pick<
      MatchRecord,
      'result' | 'winnerTeam' | 'endLevel' | 'durationMs' | 'finishedAt' | 'players'
    >,
  ): Promise<MatchRecord | null>;
  getMatch(id: string): Promise<MatchRecord | null>;
  listMatchesByUser(userId: string, limit: number): Promise<MatchRecord[]>;
  queryMatchesByUser(userId: string, q: MatchesQuery): Promise<MatchesPage>;
  listLeaderboard(limit: number): Promise<LeaderboardEntry[]>;
  createRatingEvent(
    e: Omit<RatingEventRecord, 'id' | 'at'> & { id?: string; at?: string },
  ): Promise<RatingEventRecord>;
  listRatingEventsByUser(userId: string, limit: number): Promise<RatingEventRecord[]>;
}

export const ASYNC_MATCH_REPOSITORY = Symbol('ASYNC_MATCH_REPOSITORY');

// ---- Prisma row → DTO 转换 ----

type PrismaUser = {
  id: string;
  displayName: string;
  kind: 'HUMAN' | 'BOT';
  rating: number;
  matchesTotal: number;
  matchesWon: number;
  lastSeenAt: Date | null;
  createdAt: Date;
};

function toUserRecord(u: PrismaUser): UserRecord {
  return {
    id: u.id,
    displayName: u.displayName,
    isBot: u.kind === 'BOT',
    rating: u.rating,
    matchesTotal: u.matchesTotal,
    matchesWon: u.matchesWon,
    lastSeenAt: (u.lastSeenAt ?? u.createdAt).toISOString(),
  };
}

type PrismaMatchWithPlayers = {
  id: string;
  roomId: string;
  kind: 'CASUAL' | 'RANKED' | 'AI_TRAINING' | 'TOURNAMENT';
  result: 'PENDING' | 'COMPLETED' | 'ABORTED' | 'DRAW';
  winnerTeam: string | null;
  startLevel: string;
  endLevel: string | null;
  hasAiPlayers: boolean;
  durationMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  players: Array<{
    userId: string;
    seat: 'N' | 'E' | 'S' | 'W';
    team: 'NS' | 'EW';
    isBot: boolean;
    botDifficulty: string | null;
    finishOrder: number | null;
    ratingBefore: number | null;
    ratingAfter: number | null;
    ratingDelta: number | null;
    user: { displayName: string };
  }>;
};

function toMatchRecord(m: PrismaMatchWithPlayers): MatchRecord {
  const players: MatchPlayerRecord[] = m.players.map((p) => ({
    userId: p.userId,
    displayName: p.user.displayName,
    seat: p.seat,
    team: p.team,
    isBot: p.isBot,
    botDifficulty: (p.botDifficulty as 'easy' | 'normal' | 'hard' | null) ?? undefined,
    finishOrder: p.finishOrder ?? undefined,
    ratingBefore: p.ratingBefore ?? undefined,
    ratingAfter: p.ratingAfter ?? undefined,
    ratingDelta: p.ratingDelta ?? undefined,
  }));
  return {
    id: m.id,
    roomId: m.roomId,
    kind: m.kind,
    result: m.result === 'DRAW' ? 'COMPLETED' : m.result,
    winnerTeam: m.winnerTeam as Team | null,
    startLevel: m.startLevel,
    endLevel: m.endLevel,
    hasAiPlayers: m.hasAiPlayers,
    durationMs: m.durationMs,
    startedAt: m.startedAt.toISOString(),
    finishedAt: m.finishedAt ? m.finishedAt.toISOString() : null,
    players,
  };
}

/**
 * Phase 2 Sprint 2 · Postgres 持久化实现。
 *
 * 默认 InMemory 实现仍是 MATCH_REPOSITORY 的同步绑定；本类作为 ASYNC_MATCH_REPOSITORY
 * 提供，外部消费者通过 token 注入并 await。
 */
@Injectable()
export class PrismaMatchRepository implements AsyncMatchRepository {
  constructor(@Optional() @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async upsertUser(
    u: Pick<UserRecord, 'id' | 'displayName' | 'isBot'>,
  ): Promise<UserRecord> {
    const row = await this.prisma.user.upsert({
      where: { id: u.id },
      update: { displayName: u.displayName, lastSeenAt: new Date() },
      create: {
        id: u.id,
        displayName: u.displayName,
        kind: u.isBot ? 'BOT' : 'HUMAN',
        lastSeenAt: new Date(),
      },
    });
    return toUserRecord(row as PrismaUser);
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserRecord(row as PrismaUser) : null;
  }

  async setUserRating(id: string, rating: number): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { rating } });
  }

  async incUserStats(id: string, won: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        matchesTotal: { increment: 1 },
        matchesWon: won ? { increment: 1 } : undefined,
      },
    });
  }

  async createMatch(
    m: Omit<MatchRecord, 'id'> & { id?: string },
  ): Promise<MatchRecord> {
    const created = await this.prisma.match.create({
      data: {
        ...(m.id ? { id: m.id } : {}),
        roomId: m.roomId,
        kind: m.kind,
        result: m.result,
        winnerTeam: m.winnerTeam,
        startLevel: m.startLevel,
        endLevel: m.endLevel,
        hasAiPlayers: m.hasAiPlayers,
        durationMs: m.durationMs,
        startedAt: new Date(m.startedAt),
        finishedAt: m.finishedAt ? new Date(m.finishedAt) : null,
        players: {
          create: m.players.map((p) => ({
            userId: p.userId,
            seat: p.seat,
            team: p.team,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty ?? null,
            finishOrder: p.finishOrder ?? null,
            ratingBefore: p.ratingBefore ?? null,
            ratingAfter: p.ratingAfter ?? null,
            ratingDelta: p.ratingDelta ?? null,
          })),
        },
      },
      include: { players: { include: { user: { select: { displayName: true } } } } },
    });
    return toMatchRecord(created as unknown as PrismaMatchWithPlayers);
  }

  async finishMatch(
    id: string,
    patch: Pick<
      MatchRecord,
      'result' | 'winnerTeam' | 'endLevel' | 'durationMs' | 'finishedAt' | 'players'
    >,
  ): Promise<MatchRecord | null> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.match.update({
          where: { id },
          data: {
            result: patch.result,
            winnerTeam: patch.winnerTeam,
            endLevel: patch.endLevel,
            durationMs: patch.durationMs,
            finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : null,
          },
        });
        // 玩家结算（rating delta / finishOrder）逐条 update
        for (const p of patch.players) {
          await tx.matchPlayer.update({
            where: { matchId_userId: { matchId: id, userId: p.userId } },
            data: {
              finishOrder: p.finishOrder ?? null,
              ratingBefore: p.ratingBefore ?? null,
              ratingAfter: p.ratingAfter ?? null,
              ratingDelta: p.ratingDelta ?? null,
            },
          });
        }
        return tx.match.findUnique({
          where: { id },
          include: { players: { include: { user: { select: { displayName: true } } } } },
        });
      });
      return updated ? toMatchRecord(updated as unknown as PrismaMatchWithPlayers) : null;
    } catch {
      return null;
    }
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const row = await this.prisma.match.findUnique({
      where: { id },
      include: { players: { include: { user: { select: { displayName: true } } } } },
    });
    return row ? toMatchRecord(row as unknown as PrismaMatchWithPlayers) : null;
  }

  async listMatchesByUser(userId: string, limit: number): Promise<MatchRecord[]> {
    const rows = await this.prisma.match.findMany({
      where: { players: { some: { userId } } },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { players: { include: { user: { select: { displayName: true } } } } },
    });
    return (rows as unknown as PrismaMatchWithPlayers[]).map(toMatchRecord);
  }

  async queryMatchesByUser(userId: string, q: MatchesQuery): Promise<MatchesPage> {
    const limit = Math.min(Math.max(q.limit, 1), 100);
    const where: Prisma.MatchWhereInput = {
      players: { some: { userId } },
    };
    if (q.completedOnly) where.result = 'COMPLETED';
    if (q.since || q.until) {
      where.startedAt = {};
      if (q.since) (where.startedAt as Prisma.DateTimeFilter).gte = new Date(q.since);
      if (q.until) (where.startedAt as Prisma.DateTimeFilter).lt = new Date(q.until);
    }
    // cursor: 严格早于 `${iso}|${id}`
    if (q.cursor) {
      const [iso, cid] = q.cursor.split('|');
      if (iso) {
        const cursorDate = new Date(iso);
        // (startedAt < cursorDate) OR (startedAt == cursorDate AND id < cursorId)
        where.OR = [
          { startedAt: { lt: cursorDate } },
          ...(cid
            ? [{ AND: [{ startedAt: cursorDate }, { id: { lt: cid } }] }]
            : []),
        ];
      }
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.match.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { players: { include: { user: { select: { displayName: true } } } } },
      }),
      this.prisma.match.count({
        where: { players: { some: { userId } }, ...(q.completedOnly ? { result: 'COMPLETED' } : {}) },
      }),
    ]);
    const all = (rows as unknown as PrismaMatchWithPlayers[]).map(toMatchRecord);
    const items = all.slice(0, limit);
    const hasMore = all.length > limit;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? `${last.startedAt}|${last.id}` : null;
    return { items, nextCursor, total };
  }

  async listLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.user.findMany({
      where: { kind: 'HUMAN', matchesTotal: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { matchesWon: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        displayName: true,
        rating: true,
        matchesTotal: true,
        matchesWon: true,
      },
    });
    return rows.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: u.displayName,
      rating: u.rating,
      matchesTotal: u.matchesTotal,
      matchesWon: u.matchesWon,
    }));
  }

  async createRatingEvent(
    e: Omit<RatingEventRecord, 'id' | 'at'> & { id?: string; at?: string },
  ): Promise<RatingEventRecord> {
    const created = await this.prisma.ratingEvent.create({
      data: {
        userId: e.userId,
        matchId: e.matchId,
        seasonId: e.seasonId,
        delta: e.delta,
        ratingBefore: e.ratingBefore,
        ratingAfter: e.ratingAfter,
        reason: e.reason,
        ...(e.at ? { at: new Date(e.at) } : {}),
      },
    });
    return {
      id: String(created.id),
      userId: created.userId,
      matchId: created.matchId,
      seasonId: created.seasonId,
      delta: created.delta,
      ratingBefore: created.ratingBefore,
      ratingAfter: created.ratingAfter,
      reason: created.reason as RatingEventRecord['reason'],
      at: created.at.toISOString(),
    };
  }

  async listRatingEventsByUser(
    userId: string,
    limit: number,
  ): Promise<RatingEventRecord[]> {
    const rows = await this.prisma.ratingEvent.findMany({
      where: { userId },
      orderBy: { at: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((r) => ({
      id: String(r.id),
      userId: r.userId,
      matchId: r.matchId,
      seasonId: r.seasonId,
      delta: r.delta,
      ratingBefore: r.ratingBefore,
      ratingAfter: r.ratingAfter,
      reason: r.reason as RatingEventRecord['reason'],
      at: r.at.toISOString(),
    }));
  }
}
