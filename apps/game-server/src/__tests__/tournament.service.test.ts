import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTournamentRepository } from '../tournament/tournament.repository.js';
import { TournamentService, TournamentError } from '../tournament/tournament.service.js';

function makeSvc() {
  const repo = new InMemoryTournamentRepository();
  const svc = new TournamentService(repo);
  return { repo, svc };
}

describe('TournamentService', () => {
  let svc: TournamentService;

  beforeEach(() => {
    svc = makeSvc().svc;
  });

  describe('createTournament', () => {
    it('creates with defaults', () => {
      const t = svc.createTournament({ name: 'Cup', hostUserId: 'h1' });
      expect(t.format).toBe('SINGLE_ELIM');
      expect(t.status).toBe('DRAFT');
      expect(t.maxTeams).toBe(16);
      expect(t.startLevel).toBe('2');
    });

    it('rejects missing name / host', () => {
      expect(() => svc.createTournament({ name: '', hostUserId: 'h' })).toThrow(TournamentError);
      expect(() => svc.createTournament({ name: 'x', hostUserId: '' })).toThrow(TournamentError);
    });

    it('rejects out-of-range maxTeams', () => {
      expect(() =>
        svc.createTournament({ name: 'x', hostUserId: 'h', maxTeams: 1 }),
      ).toThrow(/maxTeams/);
      expect(() =>
        svc.createTournament({ name: 'x', hostUserId: 'h', maxTeams: 999 }),
      ).toThrow(/maxTeams/);
    });
  });

  describe('lifecycle', () => {
    it('DRAFT -> OPEN -> DRAFT round trip via open/close', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      expect(svc.openRegistration(t.id).status).toBe('OPEN');
      expect(svc.closeRegistration(t.id).status).toBe('DRAFT');
    });

    it('rejects open from non-DRAFT', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      svc.openRegistration(t.id);
      expect(() => svc.openRegistration(t.id)).toThrow(/INVALID_STATE|Cannot open/);
    });

    it('cannot start without entries', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      svc.openRegistration(t.id);
      expect(() => svc.startTournament(t.id)).toThrow(/NOT_ENOUGH_ENTRIES|at least 2/);
    });

    it('cannot register when not OPEN', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      expect(() =>
        svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'A' }),
      ).toThrow(/REGISTRATION_CLOSED|does not accept/);
    });

    it('rejects partner == captain', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      svc.openRegistration(t.id);
      expect(() =>
        svc.registerEntry(t.id, { captainUserId: 'u1', partnerUserId: 'u1', teamName: 'A' }),
      ).toThrow(/partnerUserId must differ/);
    });

    it('maps duplicate captain to DUPLICATE_CAPTAIN', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      svc.openRegistration(t.id);
      svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'A' });
      try {
        svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'B' });
        expect.fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(TournamentError);
        expect((err as TournamentError).code).toBe('DUPLICATE_CAPTAIN');
        expect((err as TournamentError).status).toBe(409);
      }
    });

    it('maps tournament full to TOURNAMENT_FULL', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h', maxTeams: 2 });
      svc.openRegistration(t.id);
      svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'A' });
      svc.registerEntry(t.id, { captainUserId: 'u2', teamName: 'B' });
      try {
        svc.registerEntry(t.id, { captainUserId: 'u3', teamName: 'C' });
        expect.fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(TournamentError);
        expect((err as TournamentError).code).toBe('TOURNAMENT_FULL');
      }
    });

    it('startTournament generates bracket + persists rounds + flips RUNNING', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h', maxTeams: 8 });
      svc.openRegistration(t.id);
      for (let i = 1; i <= 4; i++) {
        svc.registerEntry(t.id, {
          captainUserId: `u${i}`,
          teamName: `T${i}`,
          seed: i,
        });
      }
      const { tournament, bracket } = svc.startTournament(t.id);
      expect(tournament.status).toBe('RUNNING');
      expect(tournament.startedAt).not.toBeNull();
      expect(bracket.slotCount).toBe(4);
      expect(bracket.totalRounds).toBe(2);
      // rounds 已写入仓储
      const rounds = svc['repo'].listRounds(t.id);
      expect(rounds.map((r) => r.roundIndex)).toEqual([1, 2]);
      expect(rounds.map((r) => r.name)).toEqual(['Semifinal', 'Final']);
    });

    it('previewBracket reflects current active entries without persisting', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      svc.openRegistration(t.id);
      svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'A', seed: 1 });
      svc.registerEntry(t.id, { captainUserId: 'u2', teamName: 'B', seed: 2 });
      const b = svc.previewBracket(t.id);
      expect(b.entryCount).toBe(2);
      // 没有持久化 rounds
      expect(svc['repo'].listRounds(t.id)).toHaveLength(0);
    });

    it('finishTournament requires RUNNING', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h' });
      expect(() => svc.finishTournament(t.id)).toThrow(/Cannot finish/);
    });

    it('cancelTournament refuses terminal states', () => {
      const t = svc.createTournament({ name: 'X', hostUserId: 'h', maxTeams: 4 });
      svc.openRegistration(t.id);
      svc.registerEntry(t.id, { captainUserId: 'u1', teamName: 'A' });
      svc.registerEntry(t.id, { captainUserId: 'u2', teamName: 'B' });
      svc.startTournament(t.id);
      svc.finishTournament(t.id);
      expect(() => svc.cancelTournament(t.id)).toThrow(/terminal/);
    });

    it('getTournament throws NOT_FOUND (404)', () => {
      try {
        svc.getTournament('missing');
        expect.fail('expected throw');
      } catch (err) {
        expect((err as TournamentError).status).toBe(404);
        expect((err as TournamentError).code).toBe('TOURNAMENT_NOT_FOUND');
      }
    });

    it('updateEntryStatus on missing entry → 404', () => {
      try {
        svc.updateEntryStatus('missing', 'CONFIRMED');
        expect.fail('expected throw');
      } catch (err) {
        expect((err as TournamentError).status).toBe(404);
      }
    });
  });
});
