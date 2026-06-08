import { Injectable } from '@nestjs/common';

/**
 * Phase 4 Sprint 2 · GDPR / DSR （Data Subject Request）"被遗忘权"管线。
 *
 * 本仓储抽象出"持久层中需要被匿名化的 PII"。线上落 Prisma 时由适配层把
 * 这些方法接到 Postgres 真表（users.displayName / tournament_entries.teamName 等），
 * 但本 Sprint 我们先在内存里跑通契约 + 审计 + REST 端点，避免一次性改动跨多个仓储。
 *
 * 设计原则：
 * 1. 操作幂等 —— 重复 erase 同一 userId 返回同一 `pseudonym`，不再额外触发写。
 * 2. 不删除外键 —— 匿名化（pseudonymize）而非硬删除，保护赛事/对局历史的引用完整性，
 *    符合 GDPR Art.17 关于"履行合同必要"例外的可解释口径。
 * 3. PII 字段集中声明 —— 后续接入更多带 PII 的字段（昵称变体 / 头像 URL / Teams oid 等）时，
 *    在 sink 上加新 method，service 串行调用并把命中数累计进 `ErasureSummary`。
 */
export interface UserPiiSink {
  /**
   * 匿名化用户主记录（displayName、lastSeenAt 等）。
   * - 不存在该用户 → 返回 `null`，service 据此抛 404。
   * - 已匿名化 → 返回当前 pseudonym，不重复写。
   */
  anonymizeUser(userId: string): { pseudonym: string; alreadyErased: boolean } | null;

  /** 匿名化用户在所有赛事报名记录里的 teamName / partner 字段，返回受影响行数。 */
  anonymizeTeamEntries(userId: string): number;

  /** 匿名化用户在所有公会成员记录中的额外 PII（保留 role/status；返回受影响行数）。 */
  anonymizeGuildMemberships(userId: string): number;

  /** 测试 / 管理后台预览：探查当前用户匿名化后的 displayName。 */
  inspectUser?(userId: string): { displayName: string } | null;
}

export const USER_PII_SINK = Symbol('USER_PII_SINK');

// ---------- InMemory 参考实现（test/dev） ----------

interface UserRow {
  id: string;
  displayName: string;
  /** 匿名化时间戳；非空意味着已经 erase 过。 */
  erasedAt: string | null;
}

interface EntryRow {
  id: string;
  userId: string;
  teamName: string;
  partnerUserId: string | null;
}

interface MembershipRow {
  id: string;
  userId: string;
  /** 模拟一些可能含 PII 的额外字段，比如自定义昵称 nick。 */
  nick: string | null;
}

/**
 * 短稳定哈希，生成可重放的伪名后缀。
 * 8 chars 已经远超我们测试规模碰撞概率；线上换 sha256 截断即可。
 */
export function shortHash(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

@Injectable()
export class InMemoryUserPiiSink implements UserPiiSink {
  private users = new Map<string, UserRow>();
  private entries: EntryRow[] = [];
  private memberships: MembershipRow[] = [];

  // ---- 测试辅助 seed 方法（非接口） ----
  seedUser(id: string, displayName: string): void {
    this.users.set(id, { id, displayName, erasedAt: null });
  }

  seedEntry(id: string, userId: string, teamName: string, partnerUserId: string | null = null): void {
    this.entries.push({ id, userId, teamName, partnerUserId });
  }

  seedMembership(id: string, userId: string, nick: string | null = null): void {
    this.memberships.push({ id, userId, nick });
  }

  reset(): void {
    this.users.clear();
    this.entries = [];
    this.memberships = [];
  }

  // ---- 接口实现 ----

  anonymizeUser(userId: string): { pseudonym: string; alreadyErased: boolean } | null {
    const u = this.users.get(userId);
    if (!u) return null;
    const pseudonym = `[erased:${shortHash(userId)}]`;
    if (u.erasedAt) return { pseudonym: u.displayName, alreadyErased: true };
    u.displayName = pseudonym;
    u.erasedAt = new Date().toISOString();
    return { pseudonym, alreadyErased: false };
  }

  anonymizeTeamEntries(userId: string): number {
    let touched = 0;
    const pseudo = `Team-${shortHash(userId)}`;
    for (const e of this.entries) {
      let changed = false;
      if (e.userId === userId && e.teamName !== pseudo) {
        e.teamName = pseudo;
        changed = true;
      }
      if (e.partnerUserId === userId) {
        e.partnerUserId = null;
        changed = true;
      }
      if (changed) touched++;
    }
    return touched;
  }

  anonymizeGuildMemberships(userId: string): number {
    let touched = 0;
    for (const m of this.memberships) {
      if (m.userId === userId && m.nick !== null) {
        m.nick = null;
        touched++;
      }
    }
    return touched;
  }

  inspectUser(userId: string): { displayName: string } | null {
    const u = this.users.get(userId);
    return u ? { displayName: u.displayName } : null;
  }

  inspectEntry(id: string): EntryRow | undefined {
    return this.entries.find((e) => e.id === id);
  }

  inspectMembership(id: string): MembershipRow | undefined {
    return this.memberships.find((m) => m.id === id);
  }
}
