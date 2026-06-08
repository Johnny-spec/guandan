import { Inject, Injectable } from '@nestjs/common';
import {
  GUILD_REPOSITORY,
  type GuildJoinPolicy,
  type GuildMembershipRecord,
  type GuildMembershipStatus,
  type GuildRecord,
  type GuildRepository,
  type GuildRole,
} from './guild.repository.js';

/** 业务异常（控制器映射为 4xx）。 */
export class GuildError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'GuildError';
  }
}

export interface CreateGuildInput {
  name: string;
  ownerUserId: string;
  tag?: string | null;
  description?: string | null;
  maxMembers?: number;
  joinPolicy?: GuildJoinPolicy;
  tenantId?: string | null;
}

export interface UpdateGuildInput {
  tag?: string | null;
  description?: string | null;
  maxMembers?: number;
  joinPolicy?: GuildJoinPolicy;
}

const TAG_RE = /^[A-Za-z0-9_\-]{2,6}$/;

@Injectable()
export class GuildService {
  constructor(@Inject(GUILD_REPOSITORY) private readonly repo: GuildRepository) {}

  // ---------- Guild lifecycle ----------

  createGuild(input: CreateGuildInput): GuildRecord {
    if (!input.name || input.name.trim() === '') {
      throw new GuildError('BAD_REQUEST', 'name is required');
    }
    if (!input.ownerUserId || input.ownerUserId.trim() === '') {
      throw new GuildError('BAD_REQUEST', 'ownerUserId is required');
    }
    const maxMembers = input.maxMembers ?? 50;
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 500) {
      throw new GuildError('BAD_REQUEST', 'maxMembers must be integer in [2, 500]');
    }
    const tag = input.tag ?? null;
    if (tag !== null && !TAG_RE.test(tag)) {
      throw new GuildError('BAD_REQUEST', 'tag must match /^[A-Za-z0-9_-]{2,6}$/');
    }
    const joinPolicy = input.joinPolicy ?? 'APPROVAL';
    let g: GuildRecord;
    try {
      g = this.repo.createGuild({
        name: input.name.trim(),
        tag,
        ownerUserId: input.ownerUserId,
        description: input.description ?? null,
        maxMembers,
        joinPolicy,
        tenantId: input.tenantId ?? null,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('name')) throw new GuildError('DUPLICATE_NAME', msg, 409);
      if (msg.includes('tag')) throw new GuildError('DUPLICATE_TAG', msg, 409);
      throw err;
    }
    // owner 自动以 OWNER+ACTIVE 加入
    this.repo.addMembership({
      guildId: g.id,
      userId: input.ownerUserId,
      role: 'OWNER',
      status: 'ACTIVE',
    });
    return g;
  }

  getGuild(id: string): GuildRecord {
    const g = this.repo.getGuild(id);
    if (!g) throw new GuildError('NOT_FOUND', `Guild ${id} not found`, 404);
    return g;
  }

  listGuilds(filter?: { tenantId?: string; includeDisbanded?: boolean }): GuildRecord[] {
    return this.repo.listGuilds(filter);
  }

  updateGuild(id: string, patch: UpdateGuildInput): GuildRecord {
    const g = this.getGuild(id);
    if (g.disbandedAt) {
      throw new GuildError('INVALID_STATE', 'Cannot update disbanded guild');
    }
    if (patch.tag !== undefined && patch.tag !== null && !TAG_RE.test(patch.tag)) {
      throw new GuildError('BAD_REQUEST', 'tag must match /^[A-Za-z0-9_-]{2,6}$/');
    }
    if (patch.maxMembers !== undefined) {
      if (
        !Number.isInteger(patch.maxMembers) ||
        patch.maxMembers < 2 ||
        patch.maxMembers > 500
      ) {
        throw new GuildError('BAD_REQUEST', 'maxMembers must be integer in [2, 500]');
      }
      const active = this.repo
        .listMemberships(id)
        .filter((m) => m.status === 'ACTIVE' || m.status === 'PENDING').length;
      if (patch.maxMembers < active) {
        throw new GuildError(
          'INVALID_STATE',
          `Cannot shrink below current active members (${active})`,
        );
      }
    }
    try {
      const updated = this.repo.updateGuild(id, patch);
      if (!updated) throw new GuildError('NOT_FOUND', `Guild ${id} not found`, 404);
      return updated;
    } catch (err) {
      if (err instanceof GuildError) throw err;
      const msg = (err as Error).message;
      if (msg.includes('tag')) throw new GuildError('DUPLICATE_TAG', msg, 409);
      throw err;
    }
  }

  disbandGuild(id: string, byUserId: string): GuildRecord {
    const g = this.getGuild(id);
    if (g.ownerUserId !== byUserId) {
      throw new GuildError('FORBIDDEN', 'Only owner can disband', 403);
    }
    if (g.disbandedAt) return g;
    const now = new Date().toISOString();
    const updated = this.repo.updateGuild(id, { disbandedAt: now });
    // 把所有活跃成员标记为 LEFT
    for (const m of this.repo.listMemberships(id)) {
      if (m.status === 'ACTIVE' || m.status === 'PENDING') {
        this.repo.updateMembership(m.id, { status: 'LEFT' });
      }
    }
    return updated!;
  }

  // ---------- Membership ----------

  requestJoin(guildId: string, userId: string): GuildMembershipRecord {
    const g = this.getGuild(guildId);
    if (g.disbandedAt) {
      throw new GuildError('INVALID_STATE', 'Guild is disbanded');
    }
    if (g.joinPolicy === 'INVITE_ONLY') {
      throw new GuildError('FORBIDDEN', 'Guild is invite-only', 403);
    }
    const existing = this.repo.getMembership(guildId, userId);
    if (existing) {
      throw new GuildError('DUPLICATE_MEMBERSHIP', 'Already a member or pending', 409);
    }
    const status: GuildMembershipStatus =
      g.joinPolicy === 'OPEN' ? 'ACTIVE' : 'PENDING';
    try {
      return this.repo.addMembership({
        guildId,
        userId,
        role: 'MEMBER',
        status,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('full')) throw new GuildError('GUILD_FULL', msg, 409);
      if (msg.includes('already a member'))
        throw new GuildError('DUPLICATE_MEMBERSHIP', msg, 409);
      throw err;
    }
  }

  inviteMember(
    guildId: string,
    byUserId: string,
    userId: string,
  ): GuildMembershipRecord {
    const g = this.getGuild(guildId);
    if (g.disbandedAt) throw new GuildError('INVALID_STATE', 'Guild is disbanded');
    this.assertAdmin(guildId, byUserId);
    const existing = this.repo.getMembership(guildId, userId);
    if (existing) {
      throw new GuildError('DUPLICATE_MEMBERSHIP', 'Already a member or pending', 409);
    }
    try {
      return this.repo.addMembership({
        guildId,
        userId,
        role: 'MEMBER',
        status: 'ACTIVE',
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('full')) throw new GuildError('GUILD_FULL', msg, 409);
      throw err;
    }
  }

  approveMembership(
    guildId: string,
    byUserId: string,
    membershipId: string,
  ): GuildMembershipRecord {
    this.assertAdmin(guildId, byUserId);
    const m = this.findMembershipInGuild(guildId, membershipId);
    if (m.status !== 'PENDING') {
      throw new GuildError('INVALID_STATE', `Membership status is ${m.status}`);
    }
    return this.repo.updateMembership(membershipId, { status: 'ACTIVE' })!;
  }

  kickMember(
    guildId: string,
    byUserId: string,
    membershipId: string,
  ): GuildMembershipRecord {
    this.assertAdmin(guildId, byUserId);
    const m = this.findMembershipInGuild(guildId, membershipId);
    if (m.role === 'OWNER') {
      throw new GuildError('FORBIDDEN', 'Cannot kick owner', 403);
    }
    if (m.status !== 'ACTIVE' && m.status !== 'PENDING') {
      throw new GuildError('INVALID_STATE', `Membership status is ${m.status}`);
    }
    return this.repo.updateMembership(membershipId, { status: 'KICKED' })!;
  }

  leaveGuild(guildId: string, userId: string): GuildMembershipRecord {
    const m = this.repo.getMembership(guildId, userId);
    if (!m) throw new GuildError('NOT_FOUND', 'Not a member', 404);
    if (m.role === 'OWNER') {
      throw new GuildError(
        'FORBIDDEN',
        'Owner cannot leave; transfer ownership or disband first',
        403,
      );
    }
    return this.repo.updateMembership(m.id, { status: 'LEFT' })!;
  }

  promoteMember(
    guildId: string,
    byUserId: string,
    membershipId: string,
    role: GuildRole,
  ): GuildMembershipRecord {
    const g = this.getGuild(guildId);
    if (g.ownerUserId !== byUserId) {
      throw new GuildError('FORBIDDEN', 'Only owner can change roles', 403);
    }
    if (role === 'OWNER') {
      throw new GuildError(
        'BAD_REQUEST',
        'Use transferOwnership to assign OWNER role',
      );
    }
    const m = this.findMembershipInGuild(guildId, membershipId);
    if (m.role === 'OWNER') {
      throw new GuildError('FORBIDDEN', 'Cannot demote owner', 403);
    }
    return this.repo.updateMembership(membershipId, { role })!;
  }

  listMemberships(
    guildId: string,
    filter?: { status?: GuildMembershipStatus },
  ): GuildMembershipRecord[] {
    this.getGuild(guildId);
    return this.repo.listMemberships(guildId, filter);
  }

  // ---------- internals ----------

  private assertAdmin(guildId: string, userId: string): void {
    const g = this.getGuild(guildId);
    if (g.ownerUserId === userId) return;
    const m = this.repo.getMembership(guildId, userId);
    if (!m || m.status !== 'ACTIVE' || (m.role !== 'ADMIN' && m.role !== 'OWNER')) {
      throw new GuildError('FORBIDDEN', 'Admin role required', 403);
    }
  }

  private findMembershipInGuild(
    guildId: string,
    membershipId: string,
  ): GuildMembershipRecord {
    const all = this.repo.listMemberships(guildId);
    const m = all.find((x) => x.id === membershipId);
    if (!m) throw new GuildError('NOT_FOUND', 'Membership not found', 404);
    return m;
  }
}
