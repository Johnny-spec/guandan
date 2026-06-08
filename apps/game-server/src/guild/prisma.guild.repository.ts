import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type {
  GuildJoinPolicy,
  GuildMembershipRecord,
  GuildMembershipStatus,
  GuildRecord,
  GuildRole,
} from './guild.repository.js';

export const GUILD_PRISMA_CLIENT = Symbol('GUILD_PRISMA_CLIENT');
export const ASYNC_GUILD_REPOSITORY = Symbol('ASYNC_GUILD_REPOSITORY');

/**
 * `GuildRepository` 的 Prisma 异步孪生。
 *
 * - 字段语义逐字段对齐 `InMemoryGuildRepository`，返回值统一包成 `Promise`。
 * - 唯一性靠数据库约束（`guilds.name`、`guilds.tag`、`guild_memberships.(guildId,userId)`）；
 *   写入冲突时映射为语义化错误（`DUPLICATE_NAME` / `DUPLICATE_TAG` / `DUPLICATE_MEMBER`），
 *   与 InMemory 抛错信息保持兼容，便于 GuildService 后续切换到异步仓储。
 * - 容量校验放在 GuildService 层（与 InMemory 一致），SQL 约束难以表达 `maxMembers - activeCount`。
 */
export interface AsyncGuildRepository {
  createGuild(
    g: Omit<GuildRecord, 'id' | 'createdAt' | 'updatedAt' | 'disbandedAt'> & {
      id?: string;
      disbandedAt?: string | null;
    },
  ): Promise<GuildRecord>;
  getGuild(id: string): Promise<GuildRecord | null>;
  getGuildByName(name: string): Promise<GuildRecord | null>;
  getGuildByTag(tag: string): Promise<GuildRecord | null>;
  listGuilds(filter?: {
    tenantId?: string;
    includeDisbanded?: boolean;
  }): Promise<GuildRecord[]>;
  updateGuild(
    id: string,
    patch: Partial<
      Pick<GuildRecord, 'description' | 'maxMembers' | 'joinPolicy' | 'tag' | 'disbandedAt'>
    >,
  ): Promise<GuildRecord | null>;
  addMembership(
    m: Omit<GuildMembershipRecord, 'id' | 'joinedAt' | 'leftAt'> & {
      id?: string;
      joinedAt?: string;
    },
  ): Promise<GuildMembershipRecord>;
  updateMembership(
    id: string,
    patch: Partial<Pick<GuildMembershipRecord, 'role' | 'status'>>,
  ): Promise<GuildMembershipRecord | null>;
  getMembership(guildId: string, userId: string): Promise<GuildMembershipRecord | null>;
  listMemberships(
    guildId: string,
    filter?: { status?: GuildMembershipStatus },
  ): Promise<GuildMembershipRecord[]>;
  listMembershipsByUser(
    userId: string,
    filter?: { status?: GuildMembershipStatus },
  ): Promise<GuildMembershipRecord[]>;
}

// ---- Prisma row → DTO 转换 ----

type PrismaGuild = {
  id: string;
  name: string;
  tag: string | null;
  ownerUserId: string;
  description: string | null;
  maxMembers: number;
  joinPolicy: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  disbandedAt: Date | null;
};

type PrismaGuildMembership = {
  id: string;
  guildId: string;
  userId: string;
  role: GuildRole;
  status: GuildMembershipStatus;
  joinedAt: Date;
  leftAt: Date | null;
};

function toGuild(g: PrismaGuild): GuildRecord {
  return {
    id: g.id,
    name: g.name,
    tag: g.tag,
    ownerUserId: g.ownerUserId,
    description: g.description,
    maxMembers: g.maxMembers,
    joinPolicy: g.joinPolicy as GuildJoinPolicy,
    tenantId: g.tenantId,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    disbandedAt: g.disbandedAt?.toISOString() ?? null,
  };
}

function toMembership(m: PrismaGuildMembership): GuildMembershipRecord {
  return {
    id: m.id,
    guildId: m.guildId,
    userId: m.userId,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt.toISOString(),
    leftAt: m.leftAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PrismaGuildRepository implements AsyncGuildRepository {
  constructor(
    @Optional() @Inject(GUILD_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async createGuild(
    g: Omit<GuildRecord, 'id' | 'createdAt' | 'updatedAt' | 'disbandedAt'> & {
      id?: string;
      disbandedAt?: string | null;
    },
  ): Promise<GuildRecord> {
    try {
      const row = await (this.prisma as unknown as { guild: { create: Function } }).guild.create({
        data: {
          ...(g.id ? { id: g.id } : {}),
          name: g.name,
          tag: g.tag,
          ownerUserId: g.ownerUserId,
          description: g.description,
          maxMembers: g.maxMembers,
          joinPolicy: g.joinPolicy,
          tenantId: g.tenantId,
          disbandedAt: g.disbandedAt ? new Date(g.disbandedAt) : null,
        },
      });
      return toGuild(row as unknown as PrismaGuild);
    } catch (err) {
      const meta = err as { code?: string; meta?: { target?: string[] | string } };
      if (meta?.code === 'P2002') {
        const target = Array.isArray(meta.meta?.target)
          ? meta.meta!.target.join(',')
          : meta.meta?.target ?? '';
        if (target.includes('tag')) {
          throw new Error(`Guild tag '${g.tag}' already exists`);
        }
        throw new Error(`Guild name '${g.name}' already exists`);
      }
      throw err;
    }
  }

  async getGuild(id: string): Promise<GuildRecord | null> {
    const row = await (this.prisma as unknown as { guild: { findUnique: Function } }).guild.findUnique({
      where: { id },
    });
    return row ? toGuild(row as unknown as PrismaGuild) : null;
  }

  async getGuildByName(name: string): Promise<GuildRecord | null> {
    const row = await (this.prisma as unknown as { guild: { findUnique: Function } }).guild.findUnique({
      where: { name },
    });
    return row ? toGuild(row as unknown as PrismaGuild) : null;
  }

  async getGuildByTag(tag: string): Promise<GuildRecord | null> {
    const row = await (this.prisma as unknown as { guild: { findUnique: Function } }).guild.findUnique({
      where: { tag },
    });
    return row ? toGuild(row as unknown as PrismaGuild) : null;
  }

  async listGuilds(filter?: {
    tenantId?: string;
    includeDisbanded?: boolean;
  }): Promise<GuildRecord[]> {
    const rows = await (this.prisma as unknown as { guild: { findMany: Function } }).guild.findMany({
      where: {
        ...(filter?.tenantId !== undefined ? { tenantId: filter.tenantId } : {}),
        ...(filter?.includeDisbanded ? {} : { disbandedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return (rows as unknown as PrismaGuild[]).map(toGuild);
  }

  async updateGuild(
    id: string,
    patch: Partial<
      Pick<GuildRecord, 'description' | 'maxMembers' | 'joinPolicy' | 'tag' | 'disbandedAt'>
    >,
  ): Promise<GuildRecord | null> {
    try {
      const data: Record<string, unknown> = {};
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.maxMembers !== undefined) data.maxMembers = patch.maxMembers;
      if (patch.joinPolicy !== undefined) data.joinPolicy = patch.joinPolicy;
      if (patch.tag !== undefined) data.tag = patch.tag;
      if (patch.disbandedAt !== undefined) {
        data.disbandedAt = patch.disbandedAt ? new Date(patch.disbandedAt) : null;
      }
      const row = await (this.prisma as unknown as { guild: { update: Function } }).guild.update({
        where: { id },
        data,
      });
      return toGuild(row as unknown as PrismaGuild);
    } catch (err) {
      const meta = err as { code?: string };
      if (meta?.code === 'P2002') {
        throw new Error(`Guild tag '${patch.tag}' already exists`);
      }
      return null;
    }
  }

  async addMembership(
    m: Omit<GuildMembershipRecord, 'id' | 'joinedAt' | 'leftAt'> & {
      id?: string;
      joinedAt?: string;
    },
  ): Promise<GuildMembershipRecord> {
    try {
      const row = await (
        this.prisma as unknown as { guildMembership: { create: Function } }
      ).guildMembership.create({
        data: {
          ...(m.id ? { id: m.id } : {}),
          guildId: m.guildId,
          userId: m.userId,
          role: m.role,
          status: m.status,
          ...(m.joinedAt ? { joinedAt: new Date(m.joinedAt) } : {}),
        },
      });
      return toMembership(row as unknown as PrismaGuildMembership);
    } catch (err) {
      const meta = err as { code?: string };
      if (meta?.code === 'P2002') {
        throw new Error(`User ${m.userId} already a member of ${m.guildId}`);
      }
      throw err;
    }
  }

  async updateMembership(
    id: string,
    patch: Partial<Pick<GuildMembershipRecord, 'role' | 'status'>>,
  ): Promise<GuildMembershipRecord | null> {
    try {
      const data: Record<string, unknown> = {};
      if (patch.role !== undefined) data.role = patch.role;
      if (patch.status !== undefined) {
        data.status = patch.status;
        if (patch.status === 'LEFT' || patch.status === 'KICKED') {
          data.leftAt = new Date();
        }
      }
      const row = await (
        this.prisma as unknown as { guildMembership: { update: Function } }
      ).guildMembership.update({
        where: { id },
        data,
      });
      return toMembership(row as unknown as PrismaGuildMembership);
    } catch {
      return null;
    }
  }

  async getMembership(guildId: string, userId: string): Promise<GuildMembershipRecord | null> {
    const rows = await (
      this.prisma as unknown as { guildMembership: { findMany: Function } }
    ).guildMembership.findMany({
      where: {
        guildId,
        userId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
    });
    const arr = rows as unknown as PrismaGuildMembership[];
    return arr.length > 0 ? toMembership(arr[0]!) : null;
  }

  async listMemberships(
    guildId: string,
    filter?: { status?: GuildMembershipStatus },
  ): Promise<GuildMembershipRecord[]> {
    const rows = await (
      this.prisma as unknown as { guildMembership: { findMany: Function } }
    ).guildMembership.findMany({
      where: {
        guildId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { joinedAt: 'asc' },
    });
    return (rows as unknown as PrismaGuildMembership[]).map(toMembership);
  }

  async listMembershipsByUser(
    userId: string,
    filter?: { status?: GuildMembershipStatus },
  ): Promise<GuildMembershipRecord[]> {
    const rows = await (
      this.prisma as unknown as { guildMembership: { findMany: Function } }
    ).guildMembership.findMany({
      where: {
        userId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { joinedAt: 'asc' },
    });
    return (rows as unknown as PrismaGuildMembership[]).map(toMembership);
  }
}
