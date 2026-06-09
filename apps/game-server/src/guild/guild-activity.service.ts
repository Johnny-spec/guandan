import { Inject, Injectable } from '@nestjs/common';
import {
  GUILD_REPOSITORY,
  type GuildRepository,
  type GuildRole,
} from './guild.repository.js';
import {
  GUILD_ACTIVITY_REPOSITORY,
  type GuildActivityRepository,
  type GuildChannelKind,
  type GuildChannelRecord,
  type GuildEventRecord,
  type GuildEventRsvpRecord,
  type GuildEventRsvpStatus,
} from './guild-activity.repository.js';

/**
 * Phase 4 Sprint 2 · Guild 频道 / 活动（基础）业务层。
 *
 * 鉴权策略：
 * - 创建/归档频道：OWNER / ADMIN
 * - 创建活动：OWNER / ADMIN
 * - 取消活动：host 本人 或 OWNER / ADMIN
 * - 浏览频道 / 活动 / 报名活动：任何 ACTIVE 成员
 *
 * 业务约束：
 * - 频道名长度 [2, 32]，公会内不区分大小写唯一
 * - 活动 `scheduledAt` 必须可解析；capacity 若非 null 必须 ≥ 1
 * - RSVP 命中 GOING 时受 capacity 节流（已 GOING 数 + 1 ≤ capacity）；
 *   从 GOING 改为其他状态不消费名额，再改回 GOING 时按当前实际容量重新校验
 */

export class GuildActivityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'GuildActivityError';
  }
}

const ELEVATED_ROLES: GuildRole[] = ['OWNER', 'ADMIN'];
const CHANNEL_NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_\- ]{2,32}$/;

export interface CreateChannelInput {
  name: string;
  kind?: GuildChannelKind;
  topic?: string | null;
}

export interface CreateEventInput {
  title: string;
  scheduledAt: string;
  hostUserId?: string;
  capacity?: number | null;
  description?: string | null;
}

@Injectable()
export class GuildActivityService {
  constructor(
    @Inject(GUILD_REPOSITORY) private readonly guilds: GuildRepository,
    @Inject(GUILD_ACTIVITY_REPOSITORY) private readonly repo: GuildActivityRepository,
  ) {}

  // ---------- shared guards ----------

  private requireGuild(guildId: string) {
    const g = this.guilds.getGuild(guildId);
    if (!g) throw new GuildActivityError('GUILD_NOT_FOUND', guildId, 404);
    if (g.disbandedAt) throw new GuildActivityError('GUILD_DISBANDED', guildId, 409);
    return g;
  }

  private requireActiveMember(guildId: string, userId: string) {
    const m = this.guilds.getMembership(guildId, userId);
    if (!m || m.status !== 'ACTIVE') {
      throw new GuildActivityError('NOT_MEMBER', `${userId} not active in ${guildId}`, 403);
    }
    return m;
  }

  private requireElevated(guildId: string, userId: string) {
    const m = this.requireActiveMember(guildId, userId);
    if (!ELEVATED_ROLES.includes(m.role)) {
      throw new GuildActivityError(
        'FORBIDDEN',
        `Role ${m.role} cannot perform this action`,
        403,
      );
    }
    return m;
  }

  // ---------- Channels ----------

  createChannel(
    guildId: string,
    requesterId: string,
    input: CreateChannelInput,
  ): GuildChannelRecord {
    this.requireGuild(guildId);
    this.requireElevated(guildId, requesterId);
    const name = input.name?.trim() ?? '';
    if (!CHANNEL_NAME_RE.test(name)) {
      throw new GuildActivityError(
        'BAD_REQUEST',
        'channel name must be 2-32 chars (letters/digits/CJK/space/-/_)',
      );
    }
    const lowered = name.toLowerCase();
    const dup = this.repo
      .listChannels(guildId)
      .some((c) => c.name.toLowerCase() === lowered && c.status === 'ACTIVE');
    if (dup) {
      throw new GuildActivityError(
        'DUPLICATE_NAME',
        `channel ${name} already exists in guild`,
        409,
      );
    }
    return this.repo.createChannel({
      guildId,
      name,
      kind: input.kind ?? 'TEXT',
      topic: input.topic ?? null,
      createdByUserId: requesterId,
    });
  }

  listChannels(guildId: string, requesterId: string): GuildChannelRecord[] {
    this.requireGuild(guildId);
    this.requireActiveMember(guildId, requesterId);
    return this.repo.listChannels(guildId);
  }

  archiveChannel(channelId: string, requesterId: string): GuildChannelRecord {
    const c = this.repo.getChannel(channelId);
    if (!c) throw new GuildActivityError('CHANNEL_NOT_FOUND', channelId, 404);
    this.requireElevated(c.guildId, requesterId);
    if (c.status === 'ARCHIVED') {
      throw new GuildActivityError('INVALID_STATE', 'channel already archived', 409);
    }
    return this.repo.updateChannel(channelId, {
      status: 'ARCHIVED',
      archivedAt: new Date().toISOString(),
    })!;
  }

  // ---------- Events ----------

  createEvent(
    guildId: string,
    requesterId: string,
    input: CreateEventInput,
  ): GuildEventRecord {
    this.requireGuild(guildId);
    this.requireElevated(guildId, requesterId);
    const title = input.title?.trim() ?? '';
    if (title.length < 2 || title.length > 64) {
      throw new GuildActivityError('BAD_REQUEST', 'title must be 2-64 chars');
    }
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw new GuildActivityError('BAD_REQUEST', 'scheduledAt invalid');
    }
    if (input.capacity != null) {
      if (!Number.isInteger(input.capacity) || input.capacity < 1) {
        throw new GuildActivityError('BAD_REQUEST', 'capacity must be positive integer');
      }
    }
    const host = input.hostUserId ?? requesterId;
    if (host !== requesterId) {
      // 指派 host 必须也是 ACTIVE 成员
      this.requireActiveMember(guildId, host);
    }
    return this.repo.createEvent({
      guildId,
      title,
      description: input.description ?? null,
      hostUserId: host,
      scheduledAt: when.toISOString(),
      capacity: input.capacity ?? null,
    });
  }

  listEvents(
    guildId: string,
    requesterId: string,
    filter?: { status?: GuildEventRecord['status'] },
  ): GuildEventRecord[] {
    this.requireGuild(guildId);
    this.requireActiveMember(guildId, requesterId);
    return this.repo.listEvents(guildId, filter);
  }

  cancelEvent(eventId: string, requesterId: string): GuildEventRecord {
    const e = this.repo.getEvent(eventId);
    if (!e) throw new GuildActivityError('EVENT_NOT_FOUND', eventId, 404);
    if (e.status !== 'SCHEDULED') {
      throw new GuildActivityError('INVALID_STATE', `cannot cancel from ${e.status}`, 409);
    }
    const requester = this.requireActiveMember(e.guildId, requesterId);
    const elevated = ELEVATED_ROLES.includes(requester.role);
    if (!elevated && e.hostUserId !== requesterId) {
      throw new GuildActivityError('FORBIDDEN', 'only host or guild admin can cancel', 403);
    }
    return this.repo.updateEvent(eventId, {
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    })!;
  }

  rsvpEvent(
    eventId: string,
    requesterId: string,
    status: GuildEventRsvpStatus,
  ): GuildEventRsvpRecord {
    const e = this.repo.getEvent(eventId);
    if (!e) throw new GuildActivityError('EVENT_NOT_FOUND', eventId, 404);
    if (e.status !== 'SCHEDULED') {
      throw new GuildActivityError('INVALID_STATE', `cannot RSVP to ${e.status} event`, 409);
    }
    this.requireActiveMember(e.guildId, requesterId);
    if (status === 'GOING' && e.capacity != null) {
      const current = this.repo
        .listRsvps(eventId, { status: 'GOING' })
        .filter((r) => r.userId !== requesterId).length;
      if (current + 1 > e.capacity) {
        throw new GuildActivityError(
          'CAPACITY_FULL',
          `event GOING capacity ${e.capacity} reached`,
          409,
        );
      }
    }
    return this.repo.upsertRsvp({ eventId, userId: requesterId, status });
  }

  listRsvps(
    eventId: string,
    requesterId: string,
    filter?: { status?: GuildEventRsvpStatus },
  ): GuildEventRsvpRecord[] {
    const e = this.repo.getEvent(eventId);
    if (!e) throw new GuildActivityError('EVENT_NOT_FOUND', eventId, 404);
    this.requireActiveMember(e.guildId, requesterId);
    return this.repo.listRsvps(eventId, filter);
  }
}
