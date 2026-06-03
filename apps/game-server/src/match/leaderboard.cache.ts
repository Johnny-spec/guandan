import { Injectable } from '@nestjs/common';

/**
 * 排行榜缓存（与 Redis ZSET 语义对齐）。
 *
 * 读路径走 cache（O(log N) 取 topN / O(1) 查 rank），写路径在 onFinish 后调用 setScore。
 * Sprint 2 用内存 ZSET 实现；Sprint 3 替换为 `RedisZSetLeaderboard`（基于 ioredis）。
 * 接口保持不变。
 */
export interface LeaderboardCache {
  /** 写入或更新某用户的分数（幂等）。 */
  setScore(userId: string, score: number): void;
  /** 在原分数基础上增加（不存在则视为 0 起步）。 */
  incrBy(userId: string, delta: number): number;
  /** 删除某用户。 */
  remove(userId: string): boolean;
  /** 读取分数；不存在返回 null。 */
  scoreOf(userId: string): number | null;
  /**
   * 读取排名（1 起始，分数高在前）。不存在返回 null。
   * 同分按 userId 字典序升序作为 stable 决胜。
   */
  rankOf(userId: string): number | null;
  /** Top N，分数降序。 */
  topN(n: number): readonly { userId: string; score: number; rank: number }[];
  /** 当前总条目数。 */
  size(): number;
  /** 清空（仅测试 & 启动重建用）。 */
  clear(): void;
}

interface Entry {
  userId: string;
  score: number;
}

/**
 * 内存版 ZSET：按 [score desc, userId asc] 排序的稀疏数组 + Map 索引。
 *
 * 不是高性能实现 —— 但语义与 Redis ZSET 一致，对千级用户够用，未来直接替换。
 * 关键不变量：
 *   1. 任意时刻 `sorted` 与 `index` 含相同 userId 集合
 *   2. `sorted` 始终按 `(score desc, userId asc)` 排序
 *   3. `rankOf(u)` = sorted.indexOf(u) + 1
 */
@Injectable()
export class InMemoryZSetLeaderboard implements LeaderboardCache {
  private sorted: Entry[] = [];
  private index = new Map<string, Entry>();

  private static cmp(a: Entry, b: Entry): number {
    if (b.score !== a.score) return b.score - a.score;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  }

  private removeFromSorted(userId: string): void {
    const i = this.sorted.findIndex((e) => e.userId === userId);
    if (i >= 0) this.sorted.splice(i, 1);
  }

  private insertSorted(e: Entry): void {
    // 二分插入；保持 O(log N + N)（splice 是 O(N)，但实现简单且与 Redis 等价）
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (InMemoryZSetLeaderboard.cmp(this.sorted[mid]!, e) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.sorted.splice(lo, 0, e);
  }

  setScore(userId: string, score: number): void {
    if (!Number.isFinite(score)) return;
    const existing = this.index.get(userId);
    if (existing) {
      if (existing.score === score) return;
      this.removeFromSorted(userId);
      existing.score = score;
      this.insertSorted(existing);
      return;
    }
    const e: Entry = { userId, score };
    this.index.set(userId, e);
    this.insertSorted(e);
  }

  incrBy(userId: string, delta: number): number {
    const cur = this.index.get(userId)?.score ?? 0;
    const next = cur + delta;
    this.setScore(userId, next);
    return next;
  }

  remove(userId: string): boolean {
    const e = this.index.get(userId);
    if (!e) return false;
    this.removeFromSorted(userId);
    this.index.delete(userId);
    return true;
  }

  scoreOf(userId: string): number | null {
    return this.index.get(userId)?.score ?? null;
  }

  rankOf(userId: string): number | null {
    if (!this.index.has(userId)) return null;
    const i = this.sorted.findIndex((e) => e.userId === userId);
    return i < 0 ? null : i + 1;
  }

  topN(n: number): readonly { userId: string; score: number; rank: number }[] {
    const limit = Math.min(Math.max(n, 0), this.sorted.length);
    const out: { userId: string; score: number; rank: number }[] = [];
    for (let i = 0; i < limit; i += 1) {
      const e = this.sorted[i]!;
      out.push({ userId: e.userId, score: e.score, rank: i + 1 });
    }
    return out;
  }

  size(): number {
    return this.sorted.length;
  }

  clear(): void {
    this.sorted = [];
    this.index.clear();
  }
}

export const LEADERBOARD_CACHE = Symbol('LEADERBOARD_CACHE');
