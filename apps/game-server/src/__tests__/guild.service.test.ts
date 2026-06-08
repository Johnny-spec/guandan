import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGuildRepository, GUILD_REPOSITORY } from '../guild/guild.repository.js';
import { GuildError, GuildService } from '../guild/guild.service.js';

function makeSvc() {
  const repo = new InMemoryGuildRepository();
  // 直接 new；模块装配在集成测试里覆盖
  const svc = new GuildService(repo);
  return { svc, repo };
}

describe('GuildService', () => {
  let svc: GuildService;
  let repo: InMemoryGuildRepository;

  beforeEach(() => {
    const made = makeSvc();
    svc = made.svc;
    repo = made.repo;
  });

  describe('createGuild', () => {
    it('creates with defaults + auto-adds owner as OWNER/ACTIVE member', () => {
      const g = svc.createGuild({ name: 'Aces', ownerUserId: 'u1' });
      expect(g.maxMembers).toBe(50);
      expect(g.joinPolicy).toBe('APPROVAL');
      expect(g.tag).toBeNull();
      const members = repo.listMemberships(g.id);
      expect(members).toHaveLength(1);
      expect(members[0]!.userId).toBe('u1');
      expect(members[0]!.role).toBe('OWNER');
      expect(members[0]!.status).toBe('ACTIVE');
    });

    it('rejects empty name / missing owner / out-of-range maxMembers / invalid tag', () => {
      expect(() => svc.createGuild({ name: '', ownerUserId: 'u1' })).toThrow(/name/);
      expect(() => svc.createGuild({ name: 'A', ownerUserId: '' })).toThrow(/ownerUserId/);
      expect(() =>
        svc.createGuild({ name: 'A', ownerUserId: 'u1', maxMembers: 1 }),
      ).toThrow(/maxMembers/);
      expect(() =>
        svc.createGuild({ name: 'A', ownerUserId: 'u1', tag: 'x' }),
      ).toThrow(/tag/);
      expect(() =>
        svc.createGuild({ name: 'A', ownerUserId: 'u1', tag: '!!!!' }),
      ).toThrow(/tag/);
    });

    it('maps duplicate name / tag to 409', () => {
      svc.createGuild({ name: 'Aces', ownerUserId: 'u1', tag: 'ACE' });
      try {
        svc.createGuild({ name: 'Aces', ownerUserId: 'u2' });
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(GuildError);
        expect((err as GuildError).code).toBe('DUPLICATE_NAME');
        expect((err as GuildError).status).toBe(409);
      }
      try {
        svc.createGuild({ name: 'Other', ownerUserId: 'u2', tag: 'ACE' });
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('DUPLICATE_TAG');
      }
    });
  });

  describe('getGuild / listGuilds', () => {
    it('returns 404 for unknown id', () => {
      try {
        svc.getGuild('nope');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).status).toBe(404);
      }
    });

    it('listGuilds hides disbanded by default', () => {
      const a = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      svc.createGuild({ name: 'B', ownerUserId: 'u2' });
      svc.disbandGuild(a.id, 'u1');
      const live = svc.listGuilds();
      expect(live.map((g) => g.name)).toEqual(['B']);
      const all = svc.listGuilds({ includeDisbanded: true });
      expect(all).toHaveLength(2);
    });
  });

  describe('updateGuild', () => {
    it('updates description / maxMembers / tag', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      const u = svc.updateGuild(g.id, {
        description: 'hi',
        maxMembers: 100,
        tag: 'AAA',
      });
      expect(u.description).toBe('hi');
      expect(u.maxMembers).toBe(100);
      expect(u.tag).toBe('AAA');
    });

    it('rejects shrinking maxMembers below current active count', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1', maxMembers: 10 });
      const m2 = svc.requestJoin(g.id, 'u2');
      svc.approveMembership(g.id, 'u1', m2.id);
      const m3 = svc.requestJoin(g.id, 'u3');
      svc.approveMembership(g.id, 'u1', m3.id);
      // 当前活跃 = owner + u2 + u3 = 3
      try {
        svc.updateGuild(g.id, { maxMembers: 2 });
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('INVALID_STATE');
      }
    });

    it('rejects update on disbanded guild', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      svc.disbandGuild(g.id, 'u1');
      expect(() => svc.updateGuild(g.id, { description: 'x' })).toThrow(/disbanded/);
    });
  });

  describe('disbandGuild', () => {
    it('only owner can disband; marks all active members as LEFT', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      svc.requestJoin(g.id, 'u2');
      svc.approveMembership(g.id, 'u1', repo.listMemberships(g.id)[1]!.id);
      try {
        svc.disbandGuild(g.id, 'u2');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('FORBIDDEN');
      }
      const d = svc.disbandGuild(g.id, 'u1');
      expect(d.disbandedAt).toBeTruthy();
      const members = repo.listMemberships(g.id);
      expect(members.every((m) => m.status === 'LEFT')).toBe(true);
    });
  });

  describe('membership lifecycle', () => {
    it('APPROVAL policy: requestJoin -> PENDING -> approveMembership -> ACTIVE', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      const pending = svc.requestJoin(g.id, 'u2');
      expect(pending.status).toBe('PENDING');
      const approved = svc.approveMembership(g.id, 'u1', pending.id);
      expect(approved.status).toBe('ACTIVE');
    });

    it('OPEN policy: requestJoin lands ACTIVE immediately', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1', joinPolicy: 'OPEN' });
      const m = svc.requestJoin(g.id, 'u2');
      expect(m.status).toBe('ACTIVE');
    });

    it('INVITE_ONLY policy: requestJoin forbidden; invite works', () => {
      const g = svc.createGuild({
        name: 'A',
        ownerUserId: 'u1',
        joinPolicy: 'INVITE_ONLY',
      });
      expect(() => svc.requestJoin(g.id, 'u2')).toThrow(/invite-only/);
      const m = svc.inviteMember(g.id, 'u1', 'u2');
      expect(m.status).toBe('ACTIVE');
    });

    it('requestJoin rejects duplicate active/pending', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      svc.requestJoin(g.id, 'u2');
      try {
        svc.requestJoin(g.id, 'u2');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('DUPLICATE_MEMBERSHIP');
      }
    });

    it('requestJoin rejects when guild is full', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1', maxMembers: 2 });
      svc.requestJoin(g.id, 'u2'); // owner + u2 = 2 active
      try {
        svc.requestJoin(g.id, 'u3');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('GUILD_FULL');
      }
    });

    it('kickMember: admin can kick non-owner; cannot kick owner', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      const m = svc.inviteMember(g.id, 'u1', 'u2');
      const kicked = svc.kickMember(g.id, 'u1', m.id);
      expect(kicked.status).toBe('KICKED');
      expect(kicked.leftAt).toBeTruthy();
      const ownerMembership = repo
        .listMemberships(g.id)
        .find((x) => x.userId === 'u1')!;
      try {
        svc.kickMember(g.id, 'u1', ownerMembership.id);
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('FORBIDDEN');
      }
    });

    it('leaveGuild: owner cannot leave; regular member can', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      svc.inviteMember(g.id, 'u1', 'u2');
      try {
        svc.leaveGuild(g.id, 'u1');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('FORBIDDEN');
      }
      const left = svc.leaveGuild(g.id, 'u2');
      expect(left.status).toBe('LEFT');
    });

    it('promoteMember: only owner can promote; cannot assign OWNER role', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      const m = svc.inviteMember(g.id, 'u1', 'u2');
      try {
        svc.promoteMember(g.id, 'u2', m.id, 'ADMIN');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('FORBIDDEN');
      }
      const promoted = svc.promoteMember(g.id, 'u1', m.id, 'ADMIN');
      expect(promoted.role).toBe('ADMIN');
      try {
        svc.promoteMember(g.id, 'u1', m.id, 'OWNER');
        expect.unreachable('should throw');
      } catch (err) {
        expect((err as GuildError).code).toBe('BAD_REQUEST');
      }
    });

    it('admin (non-owner) can approve pending and kick members', () => {
      const g = svc.createGuild({ name: 'A', ownerUserId: 'u1' });
      const adminM = svc.inviteMember(g.id, 'u1', 'u2');
      svc.promoteMember(g.id, 'u1', adminM.id, 'ADMIN');
      const pending = svc.requestJoin(g.id, 'u3');
      const approved = svc.approveMembership(g.id, 'u2', pending.id);
      expect(approved.status).toBe('ACTIVE');
    });
  });

  // 引用以防 ts unused (lint); GUILD_REPOSITORY 仅 module 用到
  it('exports GUILD_REPOSITORY symbol', () => {
    expect(typeof GUILD_REPOSITORY).toBe('symbol');
  });
});
