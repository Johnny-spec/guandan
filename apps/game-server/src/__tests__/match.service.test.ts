import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMatchRepository } from '../match/match.repository.js';
import { RatingService } from '../match/rating.service.js';
import { TierService } from '../match/tier.service.js';
import { InMemoryZSetLeaderboard } from '../match/leaderboard.cache.js';
import { MatchService, type MatchSeat } from '../match/match.service.js';

const seats: MatchSeat[] = [
  { userId: 'alice', displayName: 'Alice', seat: 'N', isBot: false },
  { userId: 'bob', displayName: 'Bob', seat: 'E', isBot: false },
  { userId: 'carol', displayName: 'Carol', seat: 'S', isBot: false },
  { userId: 'dan', displayName: 'Dan', seat: 'W', isBot: false },
];

describe('MatchService', () => {
  let repo: InMemoryMatchRepository;
  let svc: MatchService;

  beforeEach(() => {
    repo = new InMemoryMatchRepository();
    svc = new MatchService(repo, new RatingService(), new TierService(), new InMemoryZSetLeaderboard());
  });

  it('onStart 创建 PENDING 对局并 upsert 所有玩家', () => {
    const rec = svc.onStart('room-1', '2', seats);
    expect(rec?.result).toBe('PENDING');
    expect(rec?.kind).toBe('CASUAL');
    expect(rec?.players).toHaveLength(4);
    for (const s of seats) expect(repo.getUser(s.userId)?.rating).toBe(1000);
  });

  it('有 bot 的对局 kind=AI_TRAINING + hasAiPlayers', () => {
    const withBot: MatchSeat[] = [
      ...seats.slice(0, 3),
      { userId: 'bot-1', displayName: 'Bot', seat: 'W', isBot: true, botDifficulty: 'easy' },
    ];
    const rec = svc.onStart('room-2', '2', withBot);
    expect(rec?.kind).toBe('AI_TRAINING');
    expect(rec?.hasAiPlayers).toBe(true);
  });

  it('onFinish 落库 + 评分回写 + 统计 + duration', async () => {
    svc.onStart('room-1', '2', seats);
    await new Promise((r) => setTimeout(r, 5));
    const fin = svc.onFinish('room-1', 'NS', ['N'], '3');
    expect(fin?.result).toBe('COMPLETED');
    expect(fin?.winnerTeam).toBe('NS');
    expect(fin?.endLevel).toBe('3');
    expect(fin?.durationMs).toBeGreaterThanOrEqual(5);
    expect(repo.getUser('alice')?.rating).toBe(1012);
    expect(repo.getUser('bob')?.rating).toBe(988);
    expect(repo.getUser('alice')?.matchesWon).toBe(1);
    expect(repo.getUser('bob')?.matchesWon).toBe(0);
    expect(repo.getUser('alice')?.matchesTotal).toBe(1);
    // finishOrder 标到 N 座位
    expect(fin?.players.find((p) => p.seat === 'N')?.finishOrder).toBe(1);
  });

  it('排行榜：按 rating 倒序，且过滤 bot / 0 对局玩家', () => {
    svc.onStart('room-1', '2', seats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    // 新增 bot 与 0 局玩家不应出现
    repo.upsertUser({ id: 'bot-x', displayName: 'BotX', isBot: true });
    repo.upsertUser({ id: 'eve', displayName: 'Eve', isBot: false });
    const lb = svc.listLeaderboard(10);
    expect(lb.map((e) => e.userId)).toEqual(['alice', 'carol', 'bob', 'dan']);
    expect(lb[0]?.rank).toBe(1);
    expect(lb[0]?.rating).toBe(1012);
  });

  it('listMatchesByUser：按时间倒序，过滤未参与玩家', () => {
    svc.onStart('room-1', '2', seats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    svc.onStart('room-2', '2', seats);
    svc.onFinish('room-2', 'EW', ['E'], '3');
    const recent = svc.listMatchesByUser('alice', 5);
    expect(recent).toHaveLength(2);
    expect(new Date(recent[0]!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(recent[1]!.startedAt).getTime(),
    );
  });

  it('onFinish 无 pending 对局：警告并返回 null', () => {
    const r = svc.onFinish('ghost', 'NS', ['N'], '2');
    expect(r).toBeNull();
  });

  it('onAbort：把 PENDING 改为 ABORTED', () => {
    const start = svc.onStart('room-1', '2', seats)!;
    svc.onAbort('room-1');
    expect(repo.getMatch(start.id)?.result).toBe('ABORTED');
  });

  it('getUserView 返回带段位信息', () => {
    repo.upsertUser({ id: 'alice', displayName: 'Alice', isBot: false });
    repo.setUserRating('alice', 1150); // platinum
    const v = svc.getUserView('alice');
    expect(v?.tier.key).toBe('platinum');
    expect(v?.tier.rating).toBe(1150);
    expect(v?.tier.nextTier).toBe('diamond');
  });

  it('listLeaderboard 每个条目附带 tier', () => {
    svc.onStart('room-1', '2', seats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    const lb = svc.listLeaderboard(10);
    expect(lb.length).toBeGreaterThan(0);
    for (const e of lb) {
      expect(e.tier).toBeDefined();
      expect(typeof e.tier.label).toBe('string');
    }
  });
});
