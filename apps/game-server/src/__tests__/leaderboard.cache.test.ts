import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryZSetLeaderboard } from '../match/leaderboard.cache.js';

describe('InMemoryZSetLeaderboard', () => {
  let lb: InMemoryZSetLeaderboard;
  beforeEach(() => {
    lb = new InMemoryZSetLeaderboard();
  });

  it('setScore / topN / rankOf 基本语义', () => {
    lb.setScore('alice', 1200);
    lb.setScore('bob', 1100);
    lb.setScore('carol', 1300);
    expect(lb.topN(3).map((e) => e.userId)).toEqual(['carol', 'alice', 'bob']);
    expect(lb.rankOf('alice')).toBe(2);
    expect(lb.rankOf('carol')).toBe(1);
    expect(lb.scoreOf('bob')).toBe(1100);
  });

  it('同分按 userId 字典序稳定决胜', () => {
    lb.setScore('dan', 1000);
    lb.setScore('alice', 1000);
    lb.setScore('carol', 1000);
    const top = lb.topN(3).map((e) => e.userId);
    expect(top).toEqual(['alice', 'carol', 'dan']);
  });

  it('setScore 幂等（覆盖更新）', () => {
    lb.setScore('alice', 1000);
    lb.setScore('alice', 1500);
    expect(lb.scoreOf('alice')).toBe(1500);
    expect(lb.size()).toBe(1);
  });

  it('incrBy 累计', () => {
    expect(lb.incrBy('alice', 10)).toBe(10);
    expect(lb.incrBy('alice', 5)).toBe(15);
    expect(lb.incrBy('alice', -3)).toBe(12);
    expect(lb.scoreOf('alice')).toBe(12);
  });

  it('remove 删除后 rank 重新计算', () => {
    lb.setScore('a', 100);
    lb.setScore('b', 200);
    lb.setScore('c', 300);
    expect(lb.rankOf('b')).toBe(2);
    expect(lb.remove('c')).toBe(true);
    expect(lb.rankOf('b')).toBe(1);
    expect(lb.remove('c')).toBe(false);
    expect(lb.scoreOf('c')).toBeNull();
  });

  it('未知用户返回 null', () => {
    expect(lb.scoreOf('ghost')).toBeNull();
    expect(lb.rankOf('ghost')).toBeNull();
  });

  it('NaN/Infinity 输入被忽略', () => {
    lb.setScore('x', Number.NaN);
    lb.setScore('y', Number.POSITIVE_INFINITY);
    expect(lb.size()).toBe(0);
  });

  it('topN 截断到实际 size', () => {
    lb.setScore('a', 100);
    lb.setScore('b', 200);
    expect(lb.topN(10)).toHaveLength(2);
    expect(lb.topN(0)).toHaveLength(0);
  });

  it('排序不变量：每次 setScore 后 sorted 严格按 (score desc, userId asc)', () => {
    const ids = ['alice', 'bob', 'carol', 'dan', 'eve'];
    const scores = [1000, 1500, 800, 1200, 1500];
    for (let i = 0; i < ids.length; i += 1) {
      lb.setScore(ids[i]!, scores[i]!);
    }
    const top = lb.topN(5);
    for (let i = 0; i < top.length - 1; i += 1) {
      const cur = top[i]!;
      const nxt = top[i + 1]!;
      if (cur.score !== nxt.score) expect(cur.score).toBeGreaterThan(nxt.score);
      else expect(cur.userId < nxt.userId).toBe(true);
    }
    // 反复更新 alice 不破坏顺序
    for (let s = 600; s <= 1800; s += 100) {
      lb.setScore('alice', s);
      const t = lb.topN(5);
      for (let i = 0; i < t.length - 1; i += 1) {
        const a = t[i]!;
        const b = t[i + 1]!;
        const ok = a.score > b.score || (a.score === b.score && a.userId < b.userId);
        expect(ok).toBe(true);
      }
    }
  });
});
