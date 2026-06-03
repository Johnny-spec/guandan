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

describe('MatchService + LeaderboardCache 集成', () => {
  let repo: InMemoryMatchRepository;
  let cache: InMemoryZSetLeaderboard;
  let svc: MatchService;

  beforeEach(() => {
    repo = new InMemoryMatchRepository();
    cache = new InMemoryZSetLeaderboard();
    svc = new MatchService(repo, new RatingService(), new TierService(), cache);
  });

  it('onFinish 后 cache 包含所有人类玩家', () => {
    svc.onStart('r1', '2', seats);
    svc.onFinish('r1', 'NS', ['N'], '3');
    expect(cache.size()).toBe(4);
    for (const u of ['alice', 'bob', 'carol', 'dan']) {
      expect(cache.scoreOf(u)).not.toBeNull();
    }
  });

  it('getUserRank 返回正确名次 + tier + total', () => {
    svc.onStart('r1', '2', seats);
    svc.onFinish('r1', 'NS', ['N'], '3');
    const a = svc.getUserRank('alice')!;
    expect(a.rank).toBe(1);
    expect(a.total).toBe(4);
    expect(a.tier.key).toBeDefined();
    const b = svc.getUserRank('bob')!;
    expect(b.rank).toBeGreaterThan(2); // bob 输了，rank > 2
  });

  it('listLeaderboard 通过 cache 路径返回，rank 连续 1..N', () => {
    svc.onStart('r1', '2', seats);
    svc.onFinish('r1', 'NS', ['N'], '3');
    const lb = svc.listLeaderboard(10);
    expect(lb).toHaveLength(4);
    expect(lb.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    // 第一名分数 >= 末位
    expect(lb[0]!.rating).toBeGreaterThanOrEqual(lb[3]!.rating);
  });

  it('bot 不进 cache', () => {
    const mixed: MatchSeat[] = [
      { userId: 'alice', displayName: 'Alice', seat: 'N', isBot: false },
      { userId: 'bot1', displayName: 'B1', seat: 'E', isBot: true },
      { userId: 'carol', displayName: 'Carol', seat: 'S', isBot: false },
      { userId: 'bot2', displayName: 'B2', seat: 'W', isBot: true },
    ];
    svc.onStart('r1', '2', mixed);
    svc.onFinish('r1', 'NS', ['N'], '3');
    expect(cache.size()).toBe(2);
    expect(cache.scoreOf('bot1')).toBeNull();
  });

  it('getUserRank：未参与过对局 → rank=null', () => {
    repo.upsertUser({ id: 'ghost', displayName: 'Ghost', isBot: false });
    const r = svc.getUserRank('ghost')!;
    expect(r.rank).toBeNull();
  });
});
