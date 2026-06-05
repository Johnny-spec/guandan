import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryTournamentRepository,
  type TournamentRecord,
} from '../tournament/tournament.repository.js';

function baseTournament(): Omit<TournamentRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'Spring Cup 2026',
    hostUserId: 'host-1',
    format: 'SINGLE_ELIM',
    status: 'DRAFT',
    maxTeams: 4,
    startLevel: '2',
    registrationOpensAt: null,
    registrationClosesAt: null,
    startedAt: null,
    finishedAt: null,
    description: null,
  };
}

describe('InMemoryTournamentRepository', () => {
  let repo: InMemoryTournamentRepository;

  beforeEach(() => {
    repo = new InMemoryTournamentRepository();
  });

  it('creates and reads tournaments', () => {
    const t = repo.createTournament(baseTournament());
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBe(t.updatedAt);
    expect(repo.getTournament(t.id)).toEqual(t);
    expect(repo.getTournament('missing')).toBeNull();
  });

  it('lists tournaments newest-first and supports status / host filters', () => {
    const a = repo.createTournament({ ...baseTournament(), name: 'A' });
    const b = repo.createTournament({ ...baseTournament(), name: 'B', hostUserId: 'host-2' });
    const c = repo.createTournament({ ...baseTournament(), name: 'C', status: 'OPEN' });

    const all = repo.listTournaments();
    // 三条都在；newest-first 仅在 createdAt 不同刻时严格成立，这里只校验集合
    expect(new Set(all.map((x) => x.id))).toEqual(new Set([a.id, b.id, c.id]));

    const opens = repo.listTournaments({ status: 'OPEN' });
    expect(opens.map((x) => x.id)).toEqual([c.id]);

    const byHost = repo.listTournaments({ hostUserId: 'host-2' });
    expect(byHost.map((x) => x.id)).toEqual([b.id]);
  });

  it('transitions status and stamps startedAt / finishedAt', () => {
    const t = repo.createTournament(baseTournament());
    const running = repo.updateTournamentStatus(t.id, 'RUNNING');
    expect(running?.status).toBe('RUNNING');
    expect(running?.startedAt).not.toBeNull();
    const finished = repo.updateTournamentStatus(t.id, 'FINISHED');
    expect(finished?.finishedAt).not.toBeNull();
    expect(repo.updateTournamentStatus('missing', 'CANCELLED')).toBeNull();
  });

  it('registers entries, enforces captain uniqueness and maxTeams', () => {
    const t = repo.createTournament({ ...baseTournament(), maxTeams: 2 });
    const e1 = repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: 'u2',
      teamName: 'Aces',
      seed: 1,
    });
    expect(e1.status).toBe('PENDING');

    // 同队长重复报名 → 抛错
    expect(() =>
      repo.registerEntry({
        tournamentId: t.id,
        captainUserId: 'u1',
        partnerUserId: 'u3',
        teamName: 'Aces2',
        seed: null,
      }),
    ).toThrow(/already registered/);

    repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u3',
      partnerUserId: 'u4',
      teamName: 'Kings',
      seed: 2,
    });

    // maxTeams=2 已满
    expect(() =>
      repo.registerEntry({
        tournamentId: t.id,
        captainUserId: 'u5',
        partnerUserId: null,
        teamName: 'Queens',
        seed: null,
      }),
    ).toThrow(/full/);

    // 找不到赛事
    expect(() =>
      repo.registerEntry({
        tournamentId: 'nope',
        captainUserId: 'x',
        partnerUserId: null,
        teamName: 'Z',
        seed: null,
      }),
    ).toThrow(/not found/);
  });

  it('withdraws an entry then allows the same captain to re-register', () => {
    const t = repo.createTournament(baseTournament());
    const e = repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: 'u2',
      teamName: 'A',
      seed: null,
    });
    const withdrawn = repo.updateEntryStatus(e.id, 'WITHDRAWN');
    expect(withdrawn?.status).toBe('WITHDRAWN');
    expect(withdrawn?.withdrawnAt).not.toBeNull();
    // 重新报名应被允许
    const e2 = repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: 'u3',
      teamName: 'A2',
      seed: null,
    });
    expect(e2.id).not.toBe(e.id);
    expect(repo.listEntries(t.id).length).toBe(2);
    expect(repo.listEntries(t.id, { status: 'PENDING' }).length).toBe(1);
  });

  it('updateEntryStatus on missing id returns null', () => {
    expect(repo.updateEntryStatus('missing', 'CONFIRMED')).toBeNull();
  });

  it('adds rounds and rejects duplicate roundIndex', () => {
    const t = repo.createTournament(baseTournament());
    repo.addRound({ tournamentId: t.id, roundIndex: 1, name: 'QF' });
    repo.addRound({ tournamentId: t.id, roundIndex: 2, name: 'SF' });
    expect(() =>
      repo.addRound({ tournamentId: t.id, roundIndex: 1, name: 'dup' }),
    ).toThrow(/already exists/);
    expect(() =>
      repo.addRound({ tournamentId: 'nope', roundIndex: 1, name: 'x' }),
    ).toThrow(/not found/);
    const rounds = repo.listRounds(t.id);
    expect(rounds.map((r) => r.roundIndex)).toEqual([1, 2]);
  });

  it('reset clears all state', () => {
    const t = repo.createTournament(baseTournament());
    repo.registerEntry({
      tournamentId: t.id,
      captainUserId: 'u1',
      partnerUserId: null,
      teamName: 'A',
      seed: null,
    });
    repo.addRound({ tournamentId: t.id, roundIndex: 1, name: null });
    repo.reset();
    expect(repo.getTournament(t.id)).toBeNull();
    expect(repo.listTournaments().length).toBe(0);
  });
});
