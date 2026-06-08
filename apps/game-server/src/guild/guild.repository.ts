import { Injectable } from '@nestjs/common';

export type GuildRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type GuildMembershipStatus = 'PENDING' | 'ACTIVE' | 'LEFT' | 'KICKED';

export type GuildJoinPolicy = 'APPROVAL' | 'OPEN' | 'INVITE_ONLY';

export interface GuildRecord {
  id: string;
  name: string;
  tag: string | null;
  ownerUserId: string;
  description: string | null;
  maxMembers: number;
  joinPolicy: GuildJoinPolicy;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
  disbandedAt: string | null;
}

export interface GuildMembershipRecord {
  id: string;
  guildId: string;
  userId: string;
  role: GuildRole;
  status: GuildMembershipStatus;
  joinedAt: string;
  leftAt: string | null;
}

/**
 * Phase 4 Sprint 1：公会仓储接口。
 *
 * 与 TournamentRepository 同样的演进路径：InMemory 先行，后续 Sprint 加
 * PrismaGuildRepository（异步孪生）。同步接口保留以便 GuildService 直接组合。
 */
export interface GuildRepository {
  createGuild(
    g: Omit<GuildRecord, 'id' | 'createdAt' | 'updatedAt' | 'disbandedAt'> & {
      id?: string;
      disbandedAt?: string | null;
    },
  ): GuildRecord;
  getGuild(id: string): GuildRecord | null;
  getGuildByName(name: string): GuildRecord | null;
  getGuildByTag(tag: string): GuildRecord | null;
  listGuilds(filter?: { tenantId?: string; includeDisbanded?: boolean }): GuildRecord[];
  updateGuild(
    id: string,
    patch: Partial<
      Pick<GuildRecord, 'description' | 'maxMembers' | 'joinPolicy' | 'tag' | 'disbandedAt'>
    >,
  ): GuildRecord | null;
  /** 添加成员。同一 (guildId,userId) 活跃记录唯一；失败抛错。 */
  addMembership(
    m: Omit<GuildMembershipRecord, 'id' | 'joinedAt' | 'leftAt'> & {
      id?: string;
      joinedAt?: string;
    },
  ): GuildMembershipRecord;
  updateMembership(
    id: string,
    patch: Partial<Pick<GuildMembershipRecord, 'role' | 'status'>>,
  ): GuildMembershipRecord | null;
  getMembership(guildId: string, userId: string): GuildMembershipRecord | null;
  listMemberships(
    guildId: string,
    filter?: { status?: GuildMembershipStatus },
  ): GuildMembershipRecord[];
  listMembershipsByUser(
    userId: string,
    filter?: { status?: GuildMembershipStatus },
  ): GuildMembershipRecord[];
  /** 测试专用：清空。 */
  reset(): void;
}

export const GUILD_REPOSITORY = Symbol('GUILD_REPOSITORY');

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isActive(status: GuildMembershipStatus): boolean {
  return status === 'ACTIVE' || status === 'PENDING';
}

@Injectable()
export class InMemoryGuildRepository implements GuildRepository {
  private guilds = new Map<string, GuildRecord>();
  private guildsByName = new Map<string, string>();
  private guildsByTag = new Map<string, string>();
  private memberships = new Map<string, GuildMembershipRecord[]>();
  private membershipIndex = new Map<string, string>();

  createGuild(
    g: Omit<GuildRecord, 'id' | 'createdAt' | 'updatedAt' | 'disbandedAt'> & {
      id?: string;
      disbandedAt?: string | null;
    },
  ): GuildRecord {
    if (this.guildsByName.has(g.name)) {
      throw new Error(`Guild name '${g.name}' already exists`);
    }
    if (g.tag && this.guildsByTag.has(g.tag)) {
      throw new Error(`Guild tag '${g.tag}' already exists`);
    }
    const now = new Date().toISOString();
    const rec: GuildRecord = {
      id: g.id ?? makeId(),
      name: g.name,
      tag: g.tag,
      ownerUserId: g.ownerUserId,
      description: g.description,
      maxMembers: g.maxMembers,
      joinPolicy: g.joinPolicy,
      tenantId: g.tenantId,
      createdAt: now,
      updatedAt: now,
      disbandedAt: g.disbandedAt ?? null,
    };
    this.guilds.set(rec.id, rec);
    this.guildsByName.set(rec.name, rec.id);
    if (rec.tag) this.guildsByTag.set(rec.tag, rec.id);
    this.memberships.set(rec.id, []);
    return rec;
  }

  getGuild(id: string): GuildRecord | null {
    return this.guilds.get(id) ?? null;
  }

  getGuildByName(name: string): GuildRecord | null {
    const id = this.guildsByName.get(name);
    return id ? this.guilds.get(id) ?? null : null;
  }

  getGuildByTag(tag: string): GuildRecord | null {
    const id = this.guildsByTag.get(tag);
    return id ? this.guilds.get(id) ?? null : null;
  }

  listGuilds(filter?: { tenantId?: string; includeDisbanded?: boolean }): GuildRecord[] {
    let rows = Array.from(this.guilds.values());
    if (filter?.tenantId !== undefined) {
      rows = rows.filter((g) => g.tenantId === filter.tenantId);
    }
    if (!filter?.includeDisbanded) {
      rows = rows.filter((g) => g.disbandedAt === null);
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateGuild(
    id: string,
    patch: Partial<
      Pick<GuildRecord, 'description' | 'maxMembers' | 'joinPolicy' | 'tag' | 'disbandedAt'>
    >,
  ): GuildRecord | null {
    const g = this.guilds.get(id);
    if (!g) return null;
    if (patch.tag !== undefined && patch.tag !== g.tag) {
      if (patch.tag !== null && this.guildsByTag.has(patch.tag)) {
        throw new Error(`Guild tag '${patch.tag}' already exists`);
      }
      if (g.tag) this.guildsByTag.delete(g.tag);
      if (patch.tag !== null) this.guildsByTag.set(patch.tag, id);
      g.tag = patch.tag;
    }
    if (patch.description !== undefined) g.description = patch.description;
    if (patch.maxMembers !== undefined) g.maxMembers = patch.maxMembers;
    if (patch.joinPolicy !== undefined) g.joinPolicy = patch.joinPolicy;
    if (patch.disbandedAt !== undefined) g.disbandedAt = patch.disbandedAt;
    g.updatedAt = new Date().toISOString();
    return g;
  }

  addMembership(
    m: Omit<GuildMembershipRecord, 'id' | 'joinedAt' | 'leftAt'> & {
      id?: string;
      joinedAt?: string;
    },
  ): GuildMembershipRecord {
    const g = this.guilds.get(m.guildId);
    if (!g) throw new Error(`Guild ${m.guildId} not found`);
    if (g.disbandedAt) throw new Error(`Guild ${m.guildId} is disbanded`);
    const list = this.memberships.get(m.guildId)!;
    const existing = list.find((x) => x.userId === m.userId && isActive(x.status));
    if (existing) {
      throw new Error(`User ${m.userId} already a member of ${m.guildId}`);
    }
    const activeCount = list.filter((x) => isActive(x.status)).length;
    if (activeCount >= g.maxMembers) {
      throw new Error(`Guild ${m.guildId} is full (maxMembers=${g.maxMembers})`);
    }
    const rec: GuildMembershipRecord = {
      id: m.id ?? makeId(),
      guildId: m.guildId,
      userId: m.userId,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt ?? new Date().toISOString(),
      leftAt: null,
    };
    list.push(rec);
    this.membershipIndex.set(rec.id, m.guildId);
    return rec;
  }

  updateMembership(
    id: string,
    patch: Partial<Pick<GuildMembershipRecord, 'role' | 'status'>>,
  ): GuildMembershipRecord | null {
    const gid = this.membershipIndex.get(id);
    if (!gid) return null;
    const list = this.memberships.get(gid);
    const rec = list?.find((x) => x.id === id);
    if (!rec) return null;
    if (patch.role !== undefined) rec.role = patch.role;
    if (patch.status !== undefined) {
      rec.status = patch.status;
      if ((patch.status === 'LEFT' || patch.status === 'KICKED') && !rec.leftAt) {
        rec.leftAt = new Date().toISOString();
      }
    }
    return rec;
  }

  getMembership(guildId: string, userId: string): GuildMembershipRecord | null {
    const list = this.memberships.get(guildId) ?? [];
    return list.find((x) => x.userId === userId && isActive(x.status)) ?? null;
  }

  listMemberships(
    guildId: string,
    filter?: { status?: GuildMembershipStatus },
  ): GuildMembershipRecord[] {
    const list = this.memberships.get(guildId) ?? [];
    if (!filter?.status) return [...list];
    return list.filter((m) => m.status === filter.status);
  }

  listMembershipsByUser(
    userId: string,
    filter?: { status?: GuildMembershipStatus },
  ): GuildMembershipRecord[] {
    const out: GuildMembershipRecord[] = [];
    for (const list of this.memberships.values()) {
      for (const m of list) {
        if (m.userId !== userId) continue;
        if (filter?.status && m.status !== filter.status) continue;
        out.push(m);
      }
    }
    return out;
  }

  reset(): void {
    this.guilds.clear();
    this.guildsByName.clear();
    this.guildsByTag.clear();
    this.memberships.clear();
    this.membershipIndex.clear();
  }
}
