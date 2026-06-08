import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { FakePrismaClient } from './fake.prisma-client.js';
import { PrismaGuildRepository } from '../guild/prisma.guild.repository.js';

/**
 * Phase 4 Sprint 2：PrismaGuildRepository 集成测试。
 * 以 FakePrismaClient 充当 Postgres，校验 DTO/唯一性/排序/状态时间戳逻辑。
 */
describe('PrismaGuildRepository (with FakePrismaClient)', () => {
  let fake: FakePrismaClient;
  let repo: PrismaGuildRepository;

  beforeEach(() => {
    fake = new FakePrismaClient();
    repo = new PrismaGuildRepository(fake as unknown as PrismaClient);
  });

  function makeG(overrides: Partial<Parameters<PrismaGuildRepository['createGuild']>[0]> = {}) {
    return repo.createGuild({
      name: 'Aces',
      tag: null,
      ownerUserId: 'u_owner',
      description: null,
      maxMembers: 50,
      joinPolicy: 'APPROVAL',
      tenantId: null,
      ...overrides,
    });
  }

  it('createGuild + getGuild roundtrip serializes dates to ISO', async () => {
    const g = await makeG({ name: 'Spades', tag: 'SPD' });
    expect(g.id).toBeTruthy();
    expect(g.createdAt).toMatch(/T.*Z$/);
    expect(g.disbandedAt).toBeNull();
    const fetched = await repo.getGuild(g.id);
    expect(fetched?.name).toBe('Spades');
    expect(fetched?.tag).toBe('SPD');
    expect(fetched?.joinPolicy).toBe('APPROVAL');
  });

  it('createGuild rejects duplicate name with semantic error', async () => {
    await makeG({ name: 'Hearts' });
    await expect(makeG({ name: 'Hearts' })).rejects.toThrow(/name 'Hearts'/);
  });

  it('createGuild rejects duplicate tag (when non-null)', async () => {
    await makeG({ name: 'A', tag: 'XYZ' });
    await expect(makeG({ name: 'B', tag: 'XYZ' })).rejects.toThrow(/tag 'XYZ'/);
  });

  it('createGuild allows multiple null tags', async () => {
    await makeG({ name: 'A', tag: null });
    const b = await makeG({ name: 'B', tag: null });
    expect(b.tag).toBeNull();
  });

  it('listGuilds filters by tenantId and excludes disbanded by default', async () => {
    const a = await makeG({ name: 'T1', tenantId: 'tenantA' });
    await makeG({ name: 'T2', tenantId: 'tenantB' });
    await makeG({ name: 'T3', tenantId: 'tenantA' });
    await repo.updateGuild(a.id, { disbandedAt: new Date().toISOString() });

    const tenantA = await repo.listGuilds({ tenantId: 'tenantA' });
    expect(tenantA.map((g) => g.name)).toEqual(['T3']);

    const withDisbanded = await repo.listGuilds({ tenantId: 'tenantA', includeDisbanded: true });
    expect(withDisbanded.map((g) => g.name).sort()).toEqual(['T1', 'T3']);
  });

  it('listGuilds sorts createdAt desc', async () => {
    await makeG({ name: 'first' });
    await new Promise((r) => setTimeout(r, 2));
    await makeG({ name: 'second' });
    const rows = await repo.listGuilds();
    expect(rows[0]!.name).toBe('second');
  });

  it('updateGuild patches fields and stamps disbandedAt', async () => {
    const g = await makeG({ name: 'patchme', description: 'old' });
    const updated = await repo.updateGuild(g.id, {
      description: 'new',
      maxMembers: 30,
      joinPolicy: 'OPEN',
      disbandedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(updated?.description).toBe('new');
    expect(updated?.maxMembers).toBe(30);
    expect(updated?.joinPolicy).toBe('OPEN');
    expect(updated?.disbandedAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('updateGuild tag conflict throws DUPLICATE_TAG semantic error', async () => {
    await makeG({ name: 'g1', tag: 'TAKEN' });
    const g2 = await makeG({ name: 'g2', tag: null });
    await expect(repo.updateGuild(g2.id, { tag: 'TAKEN' })).rejects.toThrow(/tag 'TAKEN'/);
  });

  it('addMembership + getMembership returns active record', async () => {
    const g = await makeG({ name: 'gm-test' });
    const m = await repo.addMembership({
      guildId: g.id,
      userId: 'u1',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    expect(m.joinedAt).toMatch(/T.*Z$/);
    const found = await repo.getMembership(g.id, 'u1');
    expect(found?.id).toBe(m.id);
    expect(found?.status).toBe('ACTIVE');
  });

  it('addMembership duplicate (guildId,userId) maps to DUPLICATE_MEMBER', async () => {
    const g = await makeG({ name: 'dup-mem' });
    await repo.addMembership({ guildId: g.id, userId: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    await expect(
      repo.addMembership({ guildId: g.id, userId: 'u1', role: 'MEMBER', status: 'PENDING' }),
    ).rejects.toThrow(/already a member/);
  });

  it('updateMembership status → LEFT auto-stamps leftAt', async () => {
    const g = await makeG({ name: 'leave-test' });
    const m = await repo.addMembership({
      guildId: g.id,
      userId: 'u1',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    expect(m.leftAt).toBeNull();
    const left = await repo.updateMembership(m.id, { status: 'LEFT' });
    expect(left?.status).toBe('LEFT');
    expect(left?.leftAt).toMatch(/T.*Z$/);
  });

  it('listMemberships filters by status and sorts joinedAt asc', async () => {
    const g = await makeG({ name: 'list-mem' });
    const a = await repo.addMembership({ guildId: g.id, userId: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    await new Promise((r) => setTimeout(r, 2));
    await repo.addMembership({ guildId: g.id, userId: 'u2', role: 'MEMBER', status: 'PENDING' });
    const active = await repo.listMemberships(g.id, { status: 'ACTIVE' });
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(a.id);
    const all = await repo.listMemberships(g.id);
    expect(all.map((m) => m.userId)).toEqual(['u1', 'u2']);
  });

  it('listMembershipsByUser walks all guilds', async () => {
    const g1 = await makeG({ name: 'gu1' });
    const g2 = await makeG({ name: 'gu2' });
    await repo.addMembership({ guildId: g1.id, userId: 'wanderer', role: 'MEMBER', status: 'ACTIVE' });
    await repo.addMembership({ guildId: g2.id, userId: 'wanderer', role: 'ADMIN', status: 'PENDING' });
    const all = await repo.listMembershipsByUser('wanderer');
    expect(all.map((m) => m.guildId).sort()).toEqual([g1.id, g2.id].sort());
    const pending = await repo.listMembershipsByUser('wanderer', { status: 'PENDING' });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.guildId).toBe(g2.id);
  });

  it('getMembership skips LEFT/KICKED records', async () => {
    const g = await makeG({ name: 'skip-left' });
    const m = await repo.addMembership({ guildId: g.id, userId: 'u1', role: 'MEMBER', status: 'ACTIVE' });
    await repo.updateMembership(m.id, { status: 'KICKED' });
    const found = await repo.getMembership(g.id, 'u1');
    expect(found).toBeNull();
  });
});
