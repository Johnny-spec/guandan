import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { FakePrismaClient } from './fake.prisma-client.js';
import { PrismaTournamentRepository } from '../tournament/prisma.tournament.repository.js';

/**
 * PrismaTournamentRepository 集成测试：以 FakePrismaClient 充当 Postgres，
 * 校验 DTO 转换 / 唯一性映射 / 排序 / 状态迁移时间戳逻辑。
 */
describe('PrismaTournamentRepository (with FakePrismaClient)', () => {
  let fake: FakePrismaClient;
  let repo: PrismaTournamentRepository;

  beforeEach(() => {
    fake = new FakePrismaClient();
    repo = new PrismaTournamentRepository(fake as unknown as PrismaClient);
  });

  function makeT(overrides: Partial<Parameters<PrismaTournamentRepository['createTournament']>[0]> = {}) {
    return repo.createTournament({
      name: 'Spring Cup',
      hostUserId: 'host1',
      format: 'SINGLE_ELIM',
      status: 'DRAFT',
      maxTeams: 8,
      startLevel: '2',
      registrationOpensAt: null,
      registrationClosesAt: null,
      startedAt: null,
      finishedAt: null,
      description: null,
      ...overrides,
    });
  }

  it('createTournament + getTournament roundtrip serializes dates to ISO', async () => {
    const t = await makeT();
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toMatch(/T.*Z$/);
    expect(t.startedAt).toBeNull();
    const fetched = await repo.getTournament(t.id);
    expect(fetched?.name).toBe('Spring Cup');
    expect(fetched?.maxTeams).toBe(8);
  });

  it('listTournaments filters by status + hostUserId and sorts createdAt desc', async () => {
    const a = await makeT({ name: 'A', hostUserId: 'h1' });
    await new Promise((r) => setTimeout(r, 2));
    const b = await makeT({ name: 'B', hostUserId: 'h1', status: 'OPEN' });
    await new Promise((r) => setTimeout(r, 2));
    await makeT({ name: 'C', hostUserId: 'h2' });

    const h1 = await repo.listTournaments({ hostUserId: 'h1' });
    expect(h1.map((t) => t.name)).toEqual(['B', 'A']);

    const open = await repo.listTournaments({ status: 'OPEN' });
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(b.id);
    expect(a.id).toBeTruthy();
  });

  it('updateTournamentStatus stamps startedAt when entering RUNNING', async () => {
    const t = await makeT();
    const running = await repo.updateTournamentStatus(t.id, 'RUNNING');
    expect(running?.status).toBe('RUNNING');
    expect(running?.startedAt).toBeTruthy();
    expect(running?.finishedAt).toBeNull();

    const finished = await repo.updateTournamentStatus(t.id, 'FINISHED');
    expect(finished?.finishedAt).toBeTruthy();
    // startedAt 应保持不变
    expect(finished?.startedAt).toBe(running?.startedAt);
  });

  it('updateTournamentStatus returns null for missing id', async () => {
    const res = await repo.updateTournamentStatus('does-not-exist', 'FINISHED');
    expect(res).toBeNull();
  });

  it('registerEntry persists + listEntries filters by status', async () => {
    const t = await makeT();
    const e1 = await repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: null,
      teamName: 'Alpha',
      seed: null,
    });
    await repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u2',
      partnerUserId: 'u3',
      teamName: 'Bravo',
      seed: 2,
      status: 'CONFIRMED',
    });
    expect(e1.status).toBe('PENDING');

    const all = await repo.listEntries(t.id);
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.teamName).sort()).toEqual(['Alpha', 'Bravo']);

    const confirmed = await repo.listEntries(t.id, { status: 'CONFIRMED' });
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.captainUserId).toBe('u2');
  });

  it('registerEntry maps P2002 to duplicate captain error', async () => {
    const t = await makeT();
    await repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: null,
      teamName: 'Alpha',
      seed: null,
    });
    await expect(
      repo.registerEntry({
        tournamentId: t.id,
        captainUserId: 'u1',
        partnerUserId: null,
        teamName: 'Alpha-2',
        seed: null,
      }),
    ).rejects.toThrow(/already registered/);
  });

  it('updateEntryStatus stamps withdrawnAt on WITHDRAWN / KICKED', async () => {
    const t = await makeT();
    const e = await repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: null,
      teamName: 'Alpha',
      seed: null,
    });
    const w = await repo.updateEntryStatus(e.id, 'WITHDRAWN');
    expect(w?.status).toBe('WITHDRAWN');
    expect(w?.withdrawnAt).toBeTruthy();
  });

  it('updateEntryStatus returns null for missing id', async () => {
    const res = await repo.updateEntryStatus('missing', 'CONFIRMED');
    expect(res).toBeNull();
  });

  it('addRound persists + listRounds returns ascending by roundIndex', async () => {
    const t = await makeT();
    await repo.addRound({ tournamentId: t.id, roundIndex: 2, name: 'Semifinal' });
    await repo.addRound({ tournamentId: t.id, roundIndex: 1, name: 'QF' });
    const rounds = await repo.listRounds(t.id);
    expect(rounds.map((r) => r.roundIndex)).toEqual([1, 2]);
    expect(rounds[0]!.name).toBe('QF');
  });

  it('addRound maps P2002 to duplicate round error', async () => {
    const t = await makeT();
    await repo.addRound({ tournamentId: t.id, roundIndex: 1, name: 'R1' });
    await expect(
      repo.addRound({ tournamentId: t.id, roundIndex: 1, name: 'R1-dup' }),
    ).rejects.toThrow(/already exists/);
  });

  it('getTournament returns null for unknown id', async () => {
    const res = await repo.getTournament('does-not-exist');
    expect(res).toBeNull();
  });
});
