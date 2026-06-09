import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryGuildRepository } from '../guild/guild.repository.js';
import { GuildService } from '../guild/guild.service.js';
import { InMemoryGuildActivityRepository } from '../guild/guild-activity.repository.js';
import {
  GuildActivityError,
  GuildActivityService,
} from '../guild/guild-activity.service.js';

function makeCtx() {
  const guilds = new InMemoryGuildRepository();
  const guildSvc = new GuildService(guilds);
  const activityRepo = new InMemoryGuildActivityRepository();
  const svc = new GuildActivityService(guilds, activityRepo);
  return { guilds, guildSvc, activityRepo, svc };
}

/** Assert fn throws a GuildActivityError whose code matches. */
function expectCode(fn: () => unknown, code: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, 'expected to throw').toBeInstanceOf(GuildActivityError);
  expect((thrown as GuildActivityError).code).toBe(code);
}

function seedGuild(ctx: ReturnType<typeof makeCtx>) {
  const g = ctx.guildSvc.createGuild({
    name: 'Test Guild',
    ownerUserId: 'owner-1',
    joinPolicy: 'OPEN',
    maxMembers: 20,
  });
  ctx.guildSvc.requestJoin(g.id, 'u2');
  ctx.guildSvc.requestJoin(g.id, 'u3');
  const m4 = ctx.guildSvc.requestJoin(g.id, 'u4');
  ctx.guildSvc.promoteMember(g.id, 'owner-1', m4.id, 'ADMIN');
  return g;
}

describe('GuildActivityService - channels', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let guildId: string;
  beforeEach(() => {
    ctx = makeCtx();
    guildId = seedGuild(ctx).id;
  });

  it('OWNER can create channel; default kind=TEXT, status=ACTIVE', () => {
    const c = ctx.svc.createChannel(guildId, 'owner-1', { name: 'general', topic: 'chat' });
    expect(c.name).toBe('general');
    expect(c.kind).toBe('TEXT');
    expect(c.status).toBe('ACTIVE');
    expect(c.createdByUserId).toBe('owner-1');
  });

  it('ADMIN can create ANNOUNCEMENT channel', () => {
    const c = ctx.svc.createChannel(guildId, 'u4', { name: 'notices', kind: 'ANNOUNCEMENT' });
    expect(c.kind).toBe('ANNOUNCEMENT');
  });

  it('regular MEMBER cannot create channel (FORBIDDEN)', () => {
    expectCode(() => ctx.svc.createChannel(guildId, 'u2', { name: 'random' }), 'FORBIDDEN');
  });

  it('non-member cannot create channel (NOT_MEMBER)', () => {
    expectCode(() => ctx.svc.createChannel(guildId, 'stranger', { name: 'sneak' }), 'NOT_MEMBER');
  });

  it('rejects invalid channel name', () => {
    expectCode(() => ctx.svc.createChannel(guildId, 'owner-1', { name: 'a' }), 'BAD_REQUEST');
    expectCode(() => ctx.svc.createChannel(guildId, 'owner-1', { name: '@@@' }), 'BAD_REQUEST');
  });

  it('case-insensitive duplicate ACTIVE name is rejected', () => {
    ctx.svc.createChannel(guildId, 'owner-1', { name: 'General' });
    expectCode(
      () => ctx.svc.createChannel(guildId, 'owner-1', { name: 'general' }),
      'DUPLICATE_NAME',
    );
  });

  it('archived channel name can be reused', () => {
    const c = ctx.svc.createChannel(guildId, 'owner-1', { name: 'foo' });
    ctx.svc.archiveChannel(c.id, 'owner-1');
    const c2 = ctx.svc.createChannel(guildId, 'owner-1', { name: 'foo' });
    expect(c2.id).not.toBe(c.id);
    expect(c2.status).toBe('ACTIVE');
  });

  it('archiveChannel twice yields INVALID_STATE', () => {
    const c = ctx.svc.createChannel(guildId, 'owner-1', { name: 'foo' });
    ctx.svc.archiveChannel(c.id, 'owner-1');
    expectCode(() => ctx.svc.archiveChannel(c.id, 'owner-1'), 'INVALID_STATE');
  });

  it('ACTIVE member can list channels', () => {
    ctx.svc.createChannel(guildId, 'owner-1', { name: 'alpha' });
    ctx.svc.createChannel(guildId, 'owner-1', { name: 'beta' });
    const list = ctx.svc.listChannels(guildId, 'u2');
    expect(list.map((c) => c.name)).toEqual(['alpha', 'beta']);
  });

  it('listChannels rejects non-member', () => {
    expectCode(() => ctx.svc.listChannels(guildId, 'stranger'), 'NOT_MEMBER');
  });
});

describe('GuildActivityService - events & RSVPs', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let guildId: string;
  beforeEach(() => {
    ctx = makeCtx();
    guildId = seedGuild(ctx).id;
  });

  it('ADMIN creates SCHEDULED event with default host=requester', () => {
    const e = ctx.svc.createEvent(guildId, 'u4', {
      title: 'Weekend Scrim',
      scheduledAt: '2030-06-09T10:00:00Z',
      capacity: 8,
    });
    expect(e.status).toBe('SCHEDULED');
    expect(e.hostUserId).toBe('u4');
    expect(e.scheduledAt).toBe('2030-06-09T10:00:00.000Z');
    expect(e.capacity).toBe(8);
  });

  it('rejects invalid scheduledAt / capacity', () => {
    expectCode(
      () =>
        ctx.svc.createEvent(guildId, 'owner-1', {
          title: 'bad time',
          scheduledAt: 'not-a-date',
        }),
      'BAD_REQUEST',
    );
    expectCode(
      () =>
        ctx.svc.createEvent(guildId, 'owner-1', {
          title: 'bad cap',
          scheduledAt: '2030-06-09T10:00:00Z',
          capacity: 0,
        }),
      'BAD_REQUEST',
    );
  });

  it('regular MEMBER cannot create event', () => {
    expectCode(
      () =>
        ctx.svc.createEvent(guildId, 'u2', {
          title: 'sneaky event',
          scheduledAt: '2030-06-09T10:00:00Z',
        }),
      'FORBIDDEN',
    );
  });

  it('host=other must be ACTIVE member', () => {
    expectCode(
      () =>
        ctx.svc.createEvent(guildId, 'owner-1', {
          title: 'foreign host',
          scheduledAt: '2030-06-09T10:00:00Z',
          hostUserId: 'stranger',
        }),
      'NOT_MEMBER',
    );
  });

  it('ACTIVE member RSVPs and lists events', () => {
    const e = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'casual night',
      scheduledAt: '2030-06-09T10:00:00Z',
    });
    const rsvp = ctx.svc.rsvpEvent(e.id, 'u2', 'GOING');
    expect(rsvp.status).toBe('GOING');
    const events = ctx.svc.listEvents(guildId, 'u3');
    expect(events).toHaveLength(1);
  });

  it('RSVP enforces capacity for GOING and releases on demotion', () => {
    const e = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'small slot',
      scheduledAt: '2030-06-09T10:00:00Z',
      capacity: 2,
    });
    ctx.svc.rsvpEvent(e.id, 'owner-1', 'GOING');
    ctx.svc.rsvpEvent(e.id, 'u2', 'GOING');
    expectCode(() => ctx.svc.rsvpEvent(e.id, 'u3', 'GOING'), 'CAPACITY_FULL');
    ctx.svc.rsvpEvent(e.id, 'u3', 'INTERESTED');
    ctx.svc.rsvpEvent(e.id, 'u2', 'DECLINED');
    const ok = ctx.svc.rsvpEvent(e.id, 'u3', 'GOING');
    expect(ok.status).toBe('GOING');
  });

  it('RSVP upsert keeps same row id when changing status', () => {
    const e = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'upsert test',
      scheduledAt: '2030-06-09T10:00:00Z',
    });
    const r1 = ctx.svc.rsvpEvent(e.id, 'u2', 'INTERESTED');
    const r2 = ctx.svc.rsvpEvent(e.id, 'u2', 'GOING');
    expect(r2.id).toBe(r1.id);
    expect(r2.status).toBe('GOING');
    expect(ctx.svc.listRsvps(e.id, 'owner-1')).toHaveLength(1);
  });

  it('host can cancel own event; regular member cannot', () => {
    const e = ctx.svc.createEvent(guildId, 'u4', {
      title: 'admin host event',
      scheduledAt: '2030-06-09T10:00:00Z',
    });
    expectCode(() => ctx.svc.cancelEvent(e.id, 'u2'), 'FORBIDDEN');
    const cancelled = ctx.svc.cancelEvent(e.id, 'u4');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it('cannot RSVP / cancel a CANCELLED event', () => {
    const e = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'will be cancelled',
      scheduledAt: '2030-06-09T10:00:00Z',
    });
    ctx.svc.cancelEvent(e.id, 'owner-1');
    expectCode(() => ctx.svc.rsvpEvent(e.id, 'u2', 'GOING'), 'INVALID_STATE');
    expectCode(() => ctx.svc.cancelEvent(e.id, 'owner-1'), 'INVALID_STATE');
  });

  it('listEvents filters by status', () => {
    const e1 = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'live one',
      scheduledAt: '2030-06-09T10:00:00Z',
    });
    const e2 = ctx.svc.createEvent(guildId, 'owner-1', {
      title: 'dead one',
      scheduledAt: '2030-06-10T10:00:00Z',
    });
    ctx.svc.cancelEvent(e2.id, 'owner-1');
    const live = ctx.svc.listEvents(guildId, 'u2', { status: 'SCHEDULED' });
    expect(live.map((e) => e.id)).toEqual([e1.id]);
    const dead = ctx.svc.listEvents(guildId, 'u2', { status: 'CANCELLED' });
    expect(dead.map((e) => e.id)).toEqual([e2.id]);
  });

  it('GUILD_DISBANDED blocks new channels / events', () => {
    ctx.guildSvc.disbandGuild(guildId, 'owner-1');
    expectCode(
      () => ctx.svc.createChannel(guildId, 'owner-1', { name: 'after-end' }),
      'GUILD_DISBANDED',
    );
    expectCode(
      () =>
        ctx.svc.createEvent(guildId, 'owner-1', {
          title: 'after-end event',
          scheduledAt: '2030-06-09T10:00:00Z',
        }),
      'GUILD_DISBANDED',
    );
  });

  it('non-existent event / channel returns 404 codes', () => {
    expectCode(() => ctx.svc.archiveChannel('ghost', 'owner-1'), 'CHANNEL_NOT_FOUND');
    expectCode(() => ctx.svc.rsvpEvent('ghost', 'u2', 'GOING'), 'EVENT_NOT_FOUND');
  });
});
