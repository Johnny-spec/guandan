import { Injectable } from '@nestjs/common';

/**
 * Phase 4 Sprint 2 · Guild 频道 / 活动（基础）数据层。
 *
 * 与 GuildRepository 平级；只覆盖 Sprint 2 必要字段。线上 Postgres 落库时直接
 * 镜像本接口（GuildChannel / GuildEvent / GuildEventRsvp 三张表）。
 */

export type GuildChannelKind = 'TEXT' | 'ANNOUNCEMENT';
export type GuildChannelStatus = 'ACTIVE' | 'ARCHIVED';

export interface GuildChannelRecord {
  id: string;
  guildId: string;
  name: string;
  kind: GuildChannelKind;
  topic: string | null;
  status: GuildChannelStatus;
  createdByUserId: string;
  createdAt: string;
  archivedAt: string | null;
}

export type GuildEventStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export interface GuildEventRecord {
  id: string;
  guildId: string;
  title: string;
  description: string | null;
  hostUserId: string;
  scheduledAt: string;
  /** 可选：报名人数上限（null = 不限）。 */
  capacity: number | null;
  status: GuildEventStatus;
  createdAt: string;
  cancelledAt: string | null;
}

export type GuildEventRsvpStatus = 'GOING' | 'INTERESTED' | 'DECLINED';

export interface GuildEventRsvpRecord {
  id: string;
  eventId: string;
  userId: string;
  status: GuildEventRsvpStatus;
  respondedAt: string;
}

export interface GuildActivityRepository {
  // ---- Channels ----
  createChannel(
    c: Omit<GuildChannelRecord, 'id' | 'createdAt' | 'archivedAt' | 'status'> & {
      id?: string;
      status?: GuildChannelStatus;
    },
  ): GuildChannelRecord;
  getChannel(id: string): GuildChannelRecord | null;
  listChannels(
    guildId: string,
    filter?: { status?: GuildChannelStatus },
  ): GuildChannelRecord[];
  updateChannel(
    id: string,
    patch: Partial<Pick<GuildChannelRecord, 'topic' | 'status' | 'archivedAt'>>,
  ): GuildChannelRecord | null;

  // ---- Events ----
  createEvent(
    e: Omit<GuildEventRecord, 'id' | 'createdAt' | 'cancelledAt' | 'status'> & {
      id?: string;
      status?: GuildEventStatus;
    },
  ): GuildEventRecord;
  getEvent(id: string): GuildEventRecord | null;
  listEvents(
    guildId: string,
    filter?: { status?: GuildEventStatus },
  ): GuildEventRecord[];
  updateEvent(
    id: string,
    patch: Partial<Pick<GuildEventRecord, 'status' | 'cancelledAt' | 'description' | 'scheduledAt' | 'capacity'>>,
  ): GuildEventRecord | null;

  // ---- RSVPs ----
  upsertRsvp(
    r: Omit<GuildEventRsvpRecord, 'id' | 'respondedAt'> & {
      id?: string;
      respondedAt?: string;
    },
  ): GuildEventRsvpRecord;
  listRsvps(eventId: string, filter?: { status?: GuildEventRsvpStatus }): GuildEventRsvpRecord[];
  getRsvp(eventId: string, userId: string): GuildEventRsvpRecord | null;

  /** 测试专用。 */
  reset(): void;
}

export const GUILD_ACTIVITY_REPOSITORY = Symbol('GUILD_ACTIVITY_REPOSITORY');

// ---------------------------------------------------------------------------
// In-memory 参考实现
// ---------------------------------------------------------------------------

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${++counter}_${Date.now().toString(36)}`;

@Injectable()
export class InMemoryGuildActivityRepository implements GuildActivityRepository {
  private channels = new Map<string, GuildChannelRecord>();
  private events = new Map<string, GuildEventRecord>();
  private rsvps = new Map<string, GuildEventRsvpRecord>();

  // ---- Channels ----
  createChannel(
    c: Omit<GuildChannelRecord, 'id' | 'createdAt' | 'archivedAt' | 'status'> & {
      id?: string;
      status?: GuildChannelStatus;
    },
  ): GuildChannelRecord {
    const id = c.id ?? nextId('chn');
    const now = new Date().toISOString();
    const rec: GuildChannelRecord = {
      id,
      guildId: c.guildId,
      name: c.name,
      kind: c.kind,
      topic: c.topic,
      status: c.status ?? 'ACTIVE',
      createdByUserId: c.createdByUserId,
      createdAt: now,
      archivedAt: null,
    };
    this.channels.set(id, rec);
    return rec;
  }

  getChannel(id: string): GuildChannelRecord | null {
    return this.channels.get(id) ?? null;
  }

  listChannels(
    guildId: string,
    filter?: { status?: GuildChannelStatus },
  ): GuildChannelRecord[] {
    const out: GuildChannelRecord[] = [];
    for (const c of this.channels.values()) {
      if (c.guildId !== guildId) continue;
      if (filter?.status && c.status !== filter.status) continue;
      out.push(c);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  updateChannel(
    id: string,
    patch: Partial<Pick<GuildChannelRecord, 'topic' | 'status' | 'archivedAt'>>,
  ): GuildChannelRecord | null {
    const c = this.channels.get(id);
    if (!c) return null;
    const next: GuildChannelRecord = { ...c, ...patch };
    this.channels.set(id, next);
    return next;
  }

  // ---- Events ----
  createEvent(
    e: Omit<GuildEventRecord, 'id' | 'createdAt' | 'cancelledAt' | 'status'> & {
      id?: string;
      status?: GuildEventStatus;
    },
  ): GuildEventRecord {
    const id = e.id ?? nextId('evt');
    const now = new Date().toISOString();
    const rec: GuildEventRecord = {
      id,
      guildId: e.guildId,
      title: e.title,
      description: e.description,
      hostUserId: e.hostUserId,
      scheduledAt: e.scheduledAt,
      capacity: e.capacity,
      status: e.status ?? 'SCHEDULED',
      createdAt: now,
      cancelledAt: null,
    };
    this.events.set(id, rec);
    return rec;
  }

  getEvent(id: string): GuildEventRecord | null {
    return this.events.get(id) ?? null;
  }

  listEvents(
    guildId: string,
    filter?: { status?: GuildEventStatus },
  ): GuildEventRecord[] {
    const out: GuildEventRecord[] = [];
    for (const e of this.events.values()) {
      if (e.guildId !== guildId) continue;
      if (filter?.status && e.status !== filter.status) continue;
      out.push(e);
    }
    return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  updateEvent(
    id: string,
    patch: Partial<Pick<GuildEventRecord, 'status' | 'cancelledAt' | 'description' | 'scheduledAt' | 'capacity'>>,
  ): GuildEventRecord | null {
    const e = this.events.get(id);
    if (!e) return null;
    const next: GuildEventRecord = { ...e, ...patch };
    this.events.set(id, next);
    return next;
  }

  // ---- RSVPs ----
  upsertRsvp(
    r: Omit<GuildEventRsvpRecord, 'id' | 'respondedAt'> & {
      id?: string;
      respondedAt?: string;
    },
  ): GuildEventRsvpRecord {
    const now = r.respondedAt ?? new Date().toISOString();
    const existing = this.getRsvp(r.eventId, r.userId);
    if (existing) {
      const next: GuildEventRsvpRecord = { ...existing, status: r.status, respondedAt: now };
      this.rsvps.set(existing.id, next);
      return next;
    }
    const id = r.id ?? nextId('rsvp');
    const rec: GuildEventRsvpRecord = {
      id,
      eventId: r.eventId,
      userId: r.userId,
      status: r.status,
      respondedAt: now,
    };
    this.rsvps.set(id, rec);
    return rec;
  }

  listRsvps(eventId: string, filter?: { status?: GuildEventRsvpStatus }): GuildEventRsvpRecord[] {
    const out: GuildEventRsvpRecord[] = [];
    for (const r of this.rsvps.values()) {
      if (r.eventId !== eventId) continue;
      if (filter?.status && r.status !== filter.status) continue;
      out.push(r);
    }
    return out.sort((a, b) => a.respondedAt.localeCompare(b.respondedAt));
  }

  getRsvp(eventId: string, userId: string): GuildEventRsvpRecord | null {
    for (const r of this.rsvps.values()) {
      if (r.eventId === eventId && r.userId === userId) return r;
    }
    return null;
  }

  reset(): void {
    this.channels.clear();
    this.events.clear();
    this.rsvps.clear();
  }
}
