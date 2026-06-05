import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaMatchRepository } from '../match/prisma.match.repository.js';

/**
 * 用最小手写 mock 校验 PrismaMatchRepository 的契约：
 *   - 传入参数被正确映射到 Prisma 调用
 *   - 返回行被正确转换为 MatchRecord / UserRecord / RatingEventRecord
 *
 * 真正的端到端 Postgres 集成测试由「集成测试：完整对局落 Postgres」lane 覆盖。
 */
function makeMockPrisma() {
  const user = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const match = {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const matchPlayer = { update: vi.fn() };
  const ratingEvent = { create: vi.fn(), findMany: vi.fn() };
  const $transaction = vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)({
        match,
        matchPlayer,
        user,
        ratingEvent,
      });
    }
    return undefined;
  });
  return { user, match, matchPlayer, ratingEvent, $transaction } as unknown as PrismaClient & {
    user: typeof user;
    match: typeof match;
    matchPlayer: typeof matchPlayer;
    ratingEvent: typeof ratingEvent;
    $transaction: typeof $transaction;
  };
}

describe('PrismaMatchRepository', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: PrismaMatchRepository;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = new PrismaMatchRepository(prisma);
  });

  it('upsertUser 将 isBot 映射为 AccountKind 枚举', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    prisma.user.upsert.mockResolvedValueOnce({
      id: 'u1',
      displayName: 'Alice',
      kind: 'HUMAN',
      rating: 1000,
      matchesTotal: 0,
      matchesWon: 0,
      lastSeenAt: now,
      createdAt: now,
    });
    const rec = await repo.upsertUser({ id: 'u1', displayName: 'Alice', isBot: false });
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        create: expect.objectContaining({ kind: 'HUMAN' }),
      }),
    );
    expect(rec.isBot).toBe(false);
    expect(rec.rating).toBe(1000);
  });

  it('upsertUser BOT 账号正确映射', async () => {
    const now = new Date();
    prisma.user.upsert.mockResolvedValueOnce({
      id: 'bot-1',
      displayName: 'Bot',
      kind: 'BOT',
      rating: 1000,
      matchesTotal: 0,
      matchesWon: 0,
      lastSeenAt: now,
      createdAt: now,
    });
    const rec = await repo.upsertUser({ id: 'bot-1', displayName: 'Bot', isBot: true });
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kind: 'BOT' }),
      }),
    );
    expect(rec.isBot).toBe(true);
  });

  it('createMatch 嵌套写入 players 并附 user.displayName', async () => {
    const startedAt = new Date('2026-06-01T10:00:00Z');
    prisma.match.create.mockResolvedValueOnce({
      id: 'm1',
      roomId: 'r1',
      kind: 'CASUAL',
      result: 'PENDING',
      winnerTeam: null,
      startLevel: '2',
      endLevel: null,
      hasAiPlayers: false,
      durationMs: null,
      startedAt,
      finishedAt: null,
      players: [
        {
          userId: 'u1',
          seat: 'N',
          team: 'NS',
          isBot: false,
          botDifficulty: null,
          finishOrder: null,
          ratingBefore: null,
          ratingAfter: null,
          ratingDelta: null,
          user: { displayName: 'Alice' },
        },
      ],
    });
    const rec = await repo.createMatch({
      roomId: 'r1',
      kind: 'CASUAL',
      result: 'PENDING',
      winnerTeam: null,
      startLevel: '2',
      endLevel: null,
      hasAiPlayers: false,
      durationMs: null,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      players: [
        {
          userId: 'u1',
          displayName: 'Alice',
          seat: 'N',
          team: 'NS',
          isBot: false,
        },
      ],
    });
    expect(prisma.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: 'r1',
          players: { create: expect.any(Array) },
        }),
      }),
    );
    expect(rec.id).toBe('m1');
    expect(rec.players[0]?.displayName).toBe('Alice');
    expect(rec.result).toBe('PENDING');
  });

  it('finishMatch 在事务内更新 match + 每个 player', async () => {
    const startedAt = new Date('2026-06-01T10:00:00Z');
    const finishedAt = new Date('2026-06-01T10:20:00Z');
    prisma.match.update.mockResolvedValue({ id: 'm1' });
    prisma.matchPlayer.update.mockResolvedValue({});
    prisma.match.findUnique.mockResolvedValueOnce({
      id: 'm1',
      roomId: 'r1',
      kind: 'CASUAL',
      result: 'COMPLETED',
      winnerTeam: 'NS',
      startLevel: '2',
      endLevel: '3',
      hasAiPlayers: false,
      durationMs: 1_200_000,
      startedAt,
      finishedAt,
      players: [],
    });
    const rec = await repo.finishMatch('m1', {
      result: 'COMPLETED',
      winnerTeam: 'NS',
      endLevel: '3',
      durationMs: 1_200_000,
      finishedAt: finishedAt.toISOString(),
      players: [
        {
          userId: 'u1',
          displayName: 'Alice',
          seat: 'N',
          team: 'NS',
          isBot: false,
          finishOrder: 1,
          ratingBefore: 1000,
          ratingAfter: 1024,
          ratingDelta: 24,
        },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({ result: 'COMPLETED', winnerTeam: 'NS' }),
      }),
    );
    expect(prisma.matchPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId_userId: { matchId: 'm1', userId: 'u1' } },
        data: expect.objectContaining({ ratingDelta: 24, finishOrder: 1 }),
      }),
    );
    expect(rec?.result).toBe('COMPLETED');
    expect(rec?.winnerTeam).toBe('NS');
  });

  it('queryMatchesByUser 构造 cursor + completedOnly + since/until filter', async () => {
    prisma.match.findMany.mockResolvedValueOnce([]);
    prisma.match.count.mockResolvedValueOnce(0);
    await repo.queryMatchesByUser('u1', {
      limit: 20,
      cursor: '2026-06-01T00:00:00.000Z|abc',
      since: '2026-05-01T00:00:00.000Z',
      until: '2026-07-01T00:00:00.000Z',
      completedOnly: true,
    });
    const args = prisma.match.findMany.mock.calls[0]![0]!;
    expect(args.take).toBe(21);
    expect(args.orderBy).toEqual([{ startedAt: 'desc' }, { id: 'desc' }]);
    expect(args.where.result).toBe('COMPLETED');
    expect(args.where.startedAt.gte).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    expect(args.where.startedAt.lt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(args.where.OR).toBeDefined();
  });

  it('queryMatchesByUser 当返回 limit+1 时生成 nextCursor', async () => {
    const t1 = new Date('2026-06-03T00:00:00Z');
    const t2 = new Date('2026-06-02T00:00:00Z');
    prisma.match.findMany.mockResolvedValueOnce([
      makeRow('m1', t1),
      makeRow('m2', t2),
      makeRow('m3', new Date('2026-06-01T00:00:00Z')),
    ]);
    prisma.match.count.mockResolvedValueOnce(10);
    const page = await repo.queryMatchesByUser('u1', { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(`${t2.toISOString()}|m2`);
    expect(page.total).toBe(10);
  });

  it('listLeaderboard 仅返回 HUMAN + 有过对局的账号', async () => {
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'u1', displayName: 'A', rating: 1100, matchesTotal: 10, matchesWon: 6 },
      { id: 'u2', displayName: 'B', rating: 1050, matchesTotal: 5, matchesWon: 2 },
    ]);
    const lb = await repo.listLeaderboard(10);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: 'HUMAN', matchesTotal: { gt: 0 } },
        orderBy: [{ rating: 'desc' }, { matchesWon: 'desc' }],
      }),
    );
    expect(lb[0]).toEqual({
      rank: 1,
      userId: 'u1',
      displayName: 'A',
      rating: 1100,
      matchesTotal: 10,
      matchesWon: 6,
    });
    expect(lb[1]?.rank).toBe(2);
  });

  it('createRatingEvent 序列化 BigInt id 为 string', async () => {
    const at = new Date('2026-06-05T12:00:00Z');
    prisma.ratingEvent.create.mockResolvedValueOnce({
      id: 42n,
      userId: 'u1',
      matchId: 'm1',
      seasonId: null,
      delta: 16,
      ratingBefore: 1000,
      ratingAfter: 1016,
      reason: 'match_win',
      at,
    });
    const rec = await repo.createRatingEvent({
      userId: 'u1',
      matchId: 'm1',
      seasonId: null,
      delta: 16,
      ratingBefore: 1000,
      ratingAfter: 1016,
      reason: 'match_win',
    });
    expect(rec.id).toBe('42');
    expect(rec.reason).toBe('match_win');
    expect(rec.at).toBe(at.toISOString());
  });

  it('getUser 找不到时返回 null', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await repo.getUser('nope')).toBeNull();
  });

  it('incUserStats won=true 时同时递增 matchesTotal + matchesWon', async () => {
    prisma.user.update.mockResolvedValueOnce({});
    await repo.incUserStats('u1', true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        matchesTotal: { increment: 1 },
        matchesWon: { increment: 1 },
      },
    });
  });

  it('incUserStats won=false 时仅递增 matchesTotal', async () => {
    prisma.user.update.mockResolvedValueOnce({});
    await repo.incUserStats('u1', false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        matchesTotal: { increment: 1 },
        matchesWon: undefined,
      },
    });
  });
});

function makeRow(id: string, startedAt: Date) {
  return {
    id,
    roomId: 'r1',
    kind: 'CASUAL',
    result: 'COMPLETED',
    winnerTeam: 'NS',
    startLevel: '2',
    endLevel: '3',
    hasAiPlayers: false,
    durationMs: 600000,
    startedAt,
    finishedAt: startedAt,
    players: [
      {
        userId: 'u1',
        seat: 'N',
        team: 'NS',
        isBot: false,
        botDifficulty: null,
        finishOrder: 1,
        ratingBefore: 1000,
        ratingAfter: 1010,
        ratingDelta: 10,
        user: { displayName: 'A' },
      },
    ],
  };
}
