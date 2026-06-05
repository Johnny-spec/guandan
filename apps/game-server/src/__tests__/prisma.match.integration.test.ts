/**
 * Phase 2 Sprint 2 收官 · 集成测试：完整对局通过 PrismaMatchRepository 落库。
 *
 * 使用 `FakePrismaClient`（内存替身，按 Prisma row 语义实现）驱动 `PrismaMatchRepository`
 * 完整生命周期，确保 cursor 翻页 / 嵌套 create / $transaction / DTO 转换 / Leaderboard
 * 排序 / RatingEvent 流水的串联与真实 Prisma 兼容。
 *
 * 真实 Postgres 集成在 docker-compose + e2e 中验证；本测试覆盖代码层面回归。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaMatchRepository } from '../match/prisma.match.repository.js';
import { FakePrismaClient } from './fake.prisma-client.js';
import type { MatchRecord } from '../match/match.repository.js';

function baseMatch(overrides: Partial<MatchRecord> = {}): Omit<MatchRecord, 'id'> {
  return {
    roomId: 'room-1',
    kind: 'CASUAL',
    result: 'PENDING',
    winnerTeam: null,
    startLevel: '2',
    endLevel: null,
    hasAiPlayers: false,
    durationMs: null,
    startedAt: new Date('2026-06-01T10:00:00Z').toISOString(),
    finishedAt: null,
    players: [],
    ...overrides,
  };
}

describe('PrismaMatchRepository · 集成测试（FakePrismaClient）', () => {
  let fake: FakePrismaClient;
  let repo: PrismaMatchRepository;

  beforeEach(async () => {
    fake = new FakePrismaClient();
    repo = new PrismaMatchRepository(fake as unknown as PrismaClient);
    // 4 玩家：Alice + Carol (NS), Bob + Dave (EW)
    await repo.upsertUser({ id: 'u-alice', displayName: 'Alice', isBot: false });
    await repo.upsertUser({ id: 'u-bob', displayName: 'Bob', isBot: false });
    await repo.upsertUser({ id: 'u-carol', displayName: 'Carol', isBot: false });
    await repo.upsertUser({ id: 'u-dave', displayName: 'Dave', isBot: false });
  });

  it('完整对局流程：createMatch(PENDING) → finishMatch → 评分流水 → leaderboard', async () => {
    // 1. 开局
    const m = await repo.createMatch({
      ...baseMatch({}),
      id: 'm1',
      players: [
        { userId: 'u-alice', displayName: 'Alice', seat: 'N', team: 'NS', isBot: false },
        { userId: 'u-carol', displayName: 'Carol', seat: 'S', team: 'NS', isBot: false },
        { userId: 'u-bob', displayName: 'Bob', seat: 'E', team: 'EW', isBot: false },
        { userId: 'u-dave', displayName: 'Dave', seat: 'W', team: 'EW', isBot: false },
      ],
    });
    expect(m.id).toBe('m1');
    expect(m.players).toHaveLength(4);
    expect(m.result).toBe('PENDING');
    expect(m.players.map((p) => p.displayName).sort()).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);

    // 2. 中途查询，PENDING 不算 completedOnly
    const pending = await repo.queryMatchesByUser('u-alice', { limit: 20, completedOnly: true });
    expect(pending.items).toHaveLength(0);
    expect(pending.total).toBe(0);

    // 3. 收官，NS 胜
    const finished = await repo.finishMatch('m1', {
      result: 'COMPLETED',
      winnerTeam: 'NS',
      endLevel: '3',
      durationMs: 1_200_000,
      finishedAt: new Date('2026-06-01T10:20:00Z').toISOString(),
      players: [
        { userId: 'u-alice', displayName: 'Alice', seat: 'N', team: 'NS', isBot: false, finishOrder: 1, ratingBefore: 1000, ratingAfter: 1024, ratingDelta: 24 },
        { userId: 'u-carol', displayName: 'Carol', seat: 'S', team: 'NS', isBot: false, finishOrder: 2, ratingBefore: 1000, ratingAfter: 1024, ratingDelta: 24 },
        { userId: 'u-bob', displayName: 'Bob', seat: 'E', team: 'EW', isBot: false, finishOrder: 3, ratingBefore: 1000, ratingAfter: 976, ratingDelta: -24 },
        { userId: 'u-dave', displayName: 'Dave', seat: 'W', team: 'EW', isBot: false, finishOrder: 4, ratingBefore: 1000, ratingAfter: 976, ratingDelta: -24 },
      ],
    });
    expect(finished?.result).toBe('COMPLETED');
    expect(finished?.winnerTeam).toBe('NS');
    expect(finished?.players.find((p) => p.userId === 'u-alice')?.ratingDelta).toBe(24);
    expect(finished?.players.find((p) => p.userId === 'u-bob')?.ratingDelta).toBe(-24);

    // 4. 收官后写 RatingEvent + incUserStats + setUserRating
    for (const p of finished!.players) {
      await repo.createRatingEvent({
        userId: p.userId,
        matchId: 'm1',
        seasonId: null,
        delta: p.ratingDelta!,
        ratingBefore: p.ratingBefore!,
        ratingAfter: p.ratingAfter!,
        reason: p.ratingDelta! > 0 ? 'match_win' : 'match_loss',
      });
      await repo.setUserRating(p.userId, p.ratingAfter!);
      await repo.incUserStats(p.userId, p.ratingDelta! > 0);
    }

    // 5. 重新查询，COMPLETED 进流水
    const after = await repo.queryMatchesByUser('u-alice', { limit: 20, completedOnly: true });
    expect(after.total).toBe(1);
    expect(after.items[0]?.id).toBe('m1');

    // 6. RatingEvent 流水返回 4 条全局，单 user 1 条
    const aliceEvents = await repo.listRatingEventsByUser('u-alice', 10);
    expect(aliceEvents).toHaveLength(1);
    expect(aliceEvents[0]?.delta).toBe(24);
    expect(aliceEvents[0]?.reason).toBe('match_win');
    expect(aliceEvents[0]?.id).toBe('1'); // BigInt → '1' 字符串

    // 7. 排行榜：Alice/Carol 1024 在前，Bob/Dave 976 在后
    const lb = await repo.listLeaderboard(10);
    expect(lb).toHaveLength(4);
    expect(lb[0]?.rating).toBe(1024);
    expect(lb[0]?.rank).toBe(1);
    expect(lb[3]?.rating).toBe(976);
    expect(lb[3]?.rank).toBe(4);

    // 8. user 累计统计
    const alice = await repo.getUser('u-alice');
    expect(alice?.rating).toBe(1024);
    expect(alice?.matchesTotal).toBe(1);
    expect(alice?.matchesWon).toBe(1);
    const bob = await repo.getUser('u-bob');
    expect(bob?.rating).toBe(976);
    expect(bob?.matchesTotal).toBe(1);
    expect(bob?.matchesWon).toBe(0);
  });

  it('cursor 翻页：3 局倒序，limit=1 翻 3 次', async () => {
    const times = [
      '2026-06-01T10:00:00Z',
      '2026-06-02T10:00:00Z',
      '2026-06-03T10:00:00Z',
    ];
    const ids = ['ma', 'mb', 'mc'];
    for (let i = 0; i < 3; i++) {
      await repo.createMatch({
        ...baseMatch({
          startedAt: new Date(times[i]!).toISOString(),
          result: 'COMPLETED',
          winnerTeam: 'NS',
          finishedAt: new Date(times[i]!).toISOString(),
        }),
        id: ids[i],
        players: [
          { userId: 'u-alice', displayName: 'Alice', seat: 'N', team: 'NS', isBot: false },
          { userId: 'u-bob', displayName: 'Bob', seat: 'E', team: 'EW', isBot: false },
        ],
      });
    }

    const page1 = await repo.queryMatchesByUser('u-alice', { limit: 1 });
    expect(page1.items.map((m) => m.id)).toEqual(['mc']);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.total).toBe(3);

    const page2 = await repo.queryMatchesByUser('u-alice', { limit: 1, cursor: page1.nextCursor! });
    expect(page2.items.map((m) => m.id)).toEqual(['mb']);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = await repo.queryMatchesByUser('u-alice', { limit: 1, cursor: page2.nextCursor! });
    expect(page3.items.map((m) => m.id)).toEqual(['ma']);
    expect(page3.nextCursor).toBeNull();
  });

  it('since/until 时间窗口过滤', async () => {
    for (const [id, iso] of [
      ['ma', '2026-05-01T10:00:00Z'],
      ['mb', '2026-06-01T10:00:00Z'],
      ['mc', '2026-07-01T10:00:00Z'],
    ]) {
      await repo.createMatch({
        ...baseMatch({ startedAt: new Date(iso!).toISOString() }),
        id: id!,
        players: [{ userId: 'u-alice', displayName: 'Alice', seat: 'N', team: 'NS', isBot: false }],
      });
    }
    const page = await repo.queryMatchesByUser('u-alice', {
      limit: 50,
      since: '2026-05-15T00:00:00Z',
      until: '2026-06-30T00:00:00Z',
    });
    expect(page.items.map((m) => m.id)).toEqual(['mb']);
  });

  it('finishMatch 对不存在的 match 返回 null（事务回滚）', async () => {
    const result = await repo.finishMatch('does-not-exist', {
      result: 'COMPLETED',
      winnerTeam: 'NS',
      endLevel: '3',
      durationMs: 100,
      finishedAt: new Date().toISOString(),
      players: [],
    });
    expect(result).toBeNull();
  });

  it('Leaderboard 排除 BOT 与 matchesTotal=0', async () => {
    await repo.upsertUser({ id: 'bot-1', displayName: 'Bot 1', isBot: true });
    // bot 也打了一局，但 listLeaderboard 应排除
    await repo.createMatch({
      ...baseMatch({ result: 'COMPLETED', winnerTeam: 'NS', finishedAt: new Date().toISOString() }),
      id: 'mbot',
      players: [
        { userId: 'u-alice', displayName: 'Alice', seat: 'N', team: 'NS', isBot: false },
        { userId: 'bot-1', displayName: 'Bot 1', seat: 'E', team: 'EW', isBot: true },
      ],
    });
    await repo.incUserStats('u-alice', true);
    await repo.incUserStats('bot-1', false);

    const lb = await repo.listLeaderboard(10);
    const ids = lb.map((e) => e.userId);
    expect(ids).toContain('u-alice');
    expect(ids).not.toContain('bot-1');
    expect(ids).not.toContain('u-bob'); // 无对局
  });
});
