import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTournamentRepository } from '../tournament/tournament.repository.js';
import { TournamentService, TournamentError } from '../tournament/tournament.service.js';

/**
 * Phase 4 Sprint 2 · TournamentService 中 bracket 推进相关方法的集成行为：
 * `getLiveBracket` / `recordBracketMatchResult` / 自动 FINISHED 状态迁移。
 */
function setupRunningTournament(numTeams = 4) {
  const repo = new InMemoryTournamentRepository();
  const svc = new TournamentService(repo);
  const t = svc.createTournament({ name: 'Cup', hostUserId: 'h1', maxTeams: numTeams });
  svc.openRegistration(t.id);
  for (let i = 1; i <= numTeams; i++) {
    svc.registerEntry(t.id, {
      captainUserId: `cap${i}`,
      teamName: `Team${i}`,
      seed: i,
    });
  }
  const { bracket } = svc.startTournament(t.id);
  return { svc, repo, tournamentId: t.id, bracket };
}

describe('TournamentService · bracket progression (Phase 4 Sprint 2)', () => {
  let setup: ReturnType<typeof setupRunningTournament>;

  beforeEach(() => {
    setup = setupRunningTournament(4);
  });

  it('getLiveBracket returns the propagated bracket cached on startTournament', () => {
    const live = setup.svc.getLiveBracket(setup.tournamentId);
    expect(live.totalRounds).toBe(2);
    expect(live.rounds[0]!.matches).toHaveLength(2);
  });

  it('getLiveBracket throws when tournament not started', () => {
    const repo = new InMemoryTournamentRepository();
    const svc = new TournamentService(repo);
    const t = svc.createTournament({ name: 'NS', hostUserId: 'h' });
    expect(() => svc.getLiveBracket(t.id)).toThrow(/not started/);
  });

  it('recordBracketMatchResult advances winner + caches new bracket', () => {
    const { svc, tournamentId } = setup;
    const r1m1Before = svc.getBracketMatch(tournamentId, 'R1M1');
    expect(r1m1Before.winner).toBeNull();
    const { bracket, champion, tournament } = svc.recordBracketMatchResult(
      tournamentId,
      'R1M1',
      'A',
    );
    expect(champion).toBeNull();
    expect(tournament.status).toBe('RUNNING');
    const r1m1After = svc.getBracketMatch(tournamentId, 'R1M1');
    expect(r1m1After.winner).toBe('A');
    // Final.slotA resolved to entry.
    expect(bracket.rounds[1]!.matches[0]!.slotA.kind).toBe('entry');
  });

  it('auto-finishes tournament when final bracket match is decided', () => {
    const { svc, tournamentId } = setup;
    svc.recordBracketMatchResult(tournamentId, 'R1M1', 'A');
    svc.recordBracketMatchResult(tournamentId, 'R1M2', 'A');
    // Final available.
    const { champion, tournament } = svc.recordBracketMatchResult(tournamentId, 'R2M1', 'A');
    expect(champion).not.toBeNull();
    expect(champion?.kind).toBe('entry');
    expect(tournament.status).toBe('FINISHED');
    expect(tournament.finishedAt).not.toBeNull();
  });

  it('rejects recording when tournament not RUNNING', () => {
    const { svc, tournamentId } = setup;
    svc.cancelTournament(tournamentId);
    try {
      svc.recordBracketMatchResult(tournamentId, 'R1M1', 'A');
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TournamentError);
      expect((err as TournamentError).code).toBe('INVALID_STATE');
    }
  });

  it('maps BracketProgressError codes to TournamentError (MATCH_NOT_FOUND 404)', () => {
    const { svc, tournamentId } = setup;
    try {
      svc.recordBracketMatchResult(tournamentId, 'R9M9', 'A');
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TournamentError);
      const e = err as TournamentError;
      expect(e.code).toBe('MATCH_NOT_FOUND');
      expect(e.status).toBe(404);
    }
  });

  it('maps SLOT_NOT_DETERMINED → 409 when round 2 slots unresolved', () => {
    const { svc, tournamentId } = setup;
    try {
      svc.recordBracketMatchResult(tournamentId, 'R2M1', 'A');
      expect.unreachable('should throw');
    } catch (err) {
      const e = err as TournamentError;
      expect(e.code).toBe('SLOT_NOT_DETERMINED');
      expect(e.status).toBe(409);
    }
  });

  it('maps MATCH_ALREADY_DECIDED → 409', () => {
    const { svc, tournamentId } = setup;
    svc.recordBracketMatchResult(tournamentId, 'R1M1', 'A');
    try {
      svc.recordBracketMatchResult(tournamentId, 'R1M1', 'B');
      expect.unreachable('should throw');
    } catch (err) {
      const e = err as TournamentError;
      expect(e.code).toBe('MATCH_ALREADY_DECIDED');
      expect(e.status).toBe(409);
    }
  });

  it('startTournament with 3 teams propagates bye into final slot A', () => {
    const repo = new InMemoryTournamentRepository();
    const svc = new TournamentService(repo);
    const t = svc.createTournament({ name: '3T', hostUserId: 'h1', maxTeams: 4 });
    svc.openRegistration(t.id);
    for (let i = 1; i <= 3; i++) {
      svc.registerEntry(t.id, { captainUserId: `c${i}`, teamName: `T${i}`, seed: i });
    }
    const { bracket } = svc.startTournament(t.id);
    // R1M1 = seed1 vs bye → already propagated to Final.slotA.
    const final = bracket.rounds[1]!.matches[0]!;
    expect(final.slotA).toMatchObject({ kind: 'entry', seed: 1 });
    expect(final.slotB.kind).toBe('winner_of');
  });
});
