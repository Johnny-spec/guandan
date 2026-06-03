import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMatchRepository } from '../match/match.repository.js';
import { RatingService } from '../match/rating.service.js';
import { TierService } from '../match/tier.service.js';
import { InMemoryZSetLeaderboard } from '../match/leaderboard.cache.js';
import { MatchService, type MatchSeat } from '../match/match.service.js';

const humanSeats: MatchSeat[] = [
  { userId: 'alice', displayName: 'Alice', seat: 'N', isBot: false },
  { userId: 'bob', displayName: 'Bob', seat: 'E', isBot: false },
  { userId: 'carol', displayName: 'Carol', seat: 'S', isBot: false },
  { userId: 'dan', displayName: 'Dan', seat: 'W', isBot: false },
];

const mixedSeats: MatchSeat[] = [
  { userId: 'alice', displayName: 'Alice', seat: 'N', isBot: false },
  { userId: 'bot1', displayName: 'Bot1', seat: 'E', isBot: true, botDifficulty: 'normal' },
  { userId: 'carol', displayName: 'Carol', seat: 'S', isBot: false },
  { userId: 'bot2', displayName: 'Bot2', seat: 'W', isBot: true, botDifficulty: 'normal' },
];

describe('RatingEvent 流水', () => {
  let repo: InMemoryMatchRepository;
  let svc: MatchService;

  beforeEach(() => {
    repo = new InMemoryMatchRepository();
    svc = new MatchService(repo, new RatingService(), new TierService(), new InMemoryZSetLeaderboard());
  });

  it('onFinish 为每个人类玩家写一条 RatingEvent', () => {
    svc.onStart('room-1', '2', humanSeats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    for (const u of ['alice', 'bob', 'carol', 'dan']) {
      const evts = svc.listRatingEventsByUser(u, 10);
      expect(evts).toHaveLength(1);
      const e = evts[0]!;
      expect(e.userId).toBe(u);
      expect(e.matchId).toBeTruthy();
      expect(e.ratingAfter - e.ratingBefore).toBe(e.delta);
    }
  });

  it('赢家 reason=match_win，输家 reason=match_loss，delta 符号正确', () => {
    svc.onStart('room-1', '2', humanSeats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    const a = svc.listRatingEventsByUser('alice', 1)[0]!;
    expect(a.reason).toBe('match_win');
    expect(a.delta).toBeGreaterThan(0);
    const b = svc.listRatingEventsByUser('bob', 1)[0]!;
    expect(b.reason).toBe('match_loss');
    expect(b.delta).toBeLessThan(0);
  });

  it('bot 不产生 RatingEvent', () => {
    svc.onStart('room-1', '2', mixedSeats);
    svc.onFinish('room-1', 'NS', ['N'], '3');
    expect(svc.listRatingEventsByUser('bot1', 10)).toHaveLength(0);
    expect(svc.listRatingEventsByUser('bot2', 10)).toHaveLength(0);
    expect(svc.listRatingEventsByUser('alice', 10)).toHaveLength(1);
    expect(svc.listRatingEventsByUser('carol', 10)).toHaveLength(1);
  });

  it('多场对局：最新事件在前，累计与最终 rating 一致', () => {
    for (let i = 0; i < 3; i += 1) {
      svc.onStart(`room-${i}`, '2', humanSeats);
      svc.onFinish(`room-${i}`, i % 2 === 0 ? 'NS' : 'EW', ['N'], '3');
    }
    const evts = svc.listRatingEventsByUser('alice', 10);
    expect(evts).toHaveLength(3);
    // 时间倒序：第一条是最新
    const times = evts.map((e) => Date.parse(e.at));
    for (let i = 0; i < times.length - 1; i += 1) {
      expect(times[i]!).toBeGreaterThanOrEqual(times[i + 1]!);
    }
    // 累计 delta = 最终 rating - 初始 1000
    const totalDelta = evts.reduce((s, e) => s + e.delta, 0);
    const final = svc.getUser('alice')!.rating;
    expect(final).toBe(1000 + totalDelta);
    // 连续事件 ratingAfter -> 下一条 ratingBefore 应连续（按时间顺序）
    const inOrder = [...evts].reverse();
    for (let i = 0; i < inOrder.length - 1; i += 1) {
      expect(inOrder[i + 1]!.ratingBefore).toBe(inOrder[i]!.ratingAfter);
    }
  });

  it('limit 截断 + 不影响存储', () => {
    for (let i = 0; i < 5; i += 1) {
      svc.onStart(`r${i}`, '2', humanSeats);
      svc.onFinish(`r${i}`, 'NS', ['N'], '3');
    }
    expect(svc.listRatingEventsByUser('alice', 2)).toHaveLength(2);
    expect(svc.listRatingEventsByUser('alice', 100)).toHaveLength(5);
  });
});
