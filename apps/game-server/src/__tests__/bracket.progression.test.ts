import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationBracket,
  recordBracketResult,
  propagateBracket,
  findBracketMatch,
  getBracketChampion,
  BracketProgressError,
} from '../tournament/bracket.js';
import type { TournamentEntryRecord } from '../tournament/tournament.repository.js';

function mkEntry(id: string, seed: number | null = null): TournamentEntryRecord {
  return {
    id,
    tournamentId: 't1',
    captainUserId: `cap-${id}`,
    partnerUserId: null,
    teamName: `Team ${id}`,
    seed,
    status: 'CONFIRMED',
    registeredAt: new Date().toISOString(),
    withdrawnAt: null,
  };
}

describe('Bracket progression (Phase 4 Sprint 2)', () => {
  describe('propagateBracket', () => {
    it('propagates a round-1 bye into round 2 slot', () => {
      const b = generateSingleEliminationBracket([
        mkEntry('a', 1),
        mkEntry('b', 2),
        mkEntry('c', 3),
      ]);
      const p = propagateBracket(b);
      // R1M1 = seed1 vs bye → winner A pre-determined.
      // R2M1.slotA should now reference entry seed1 (was winner_of:R1M1 before propagate).
      const final = p.rounds[1]!.matches[0]!;
      expect(final.slotA).toMatchObject({ kind: 'entry', seed: 1, entryId: 'a' });
      // slotB still winner_of since R1M2 hasn't been decided.
      expect(final.slotB).toMatchObject({ kind: 'winner_of', matchId: 'R1M2' });
    });

    it('is idempotent', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      const p1 = propagateBracket(b);
      const p2 = propagateBracket(p1);
      expect(p2).toEqual(p1);
    });
  });

  describe('recordBracketResult', () => {
    it('stamps winner + advances entry into next round slot', () => {
      const b = generateSingleEliminationBracket(
        ['a', 'b', 'c', 'd'].map((id, i) => mkEntry(id, i + 1)),
      );
      // QF: R1M1 = seed1(a) vs seed4(d); R1M2 = seed2(b) vs seed3(c).
      const after = recordBracketResult(b, 'R1M1', 'A');
      const r1m1 = findBracketMatch(after, 'R1M1')!;
      expect(r1m1.winner).toBe('A');
      // Final.slotA should now be entry a.
      const final = after.rounds[1]!.matches[0]!;
      expect(final.slotA).toMatchObject({ kind: 'entry', entryId: 'a' });
      expect(final.slotB).toMatchObject({ kind: 'winner_of', matchId: 'R1M2' });
    });

    it('cascades two rounds (8-team bracket → champion)', () => {
      const entries = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => mkEntry(`e${s}`, s));
      let b = generateSingleEliminationBracket(entries);
      // QF: e1 vs e8, e4 vs e5, e2 vs e7, e3 vs e6. Top seeds always win.
      b = recordBracketResult(b, 'R1M1', 'A'); // e1 wins
      b = recordBracketResult(b, 'R1M2', 'A'); // e4 wins
      b = recordBracketResult(b, 'R1M3', 'A'); // e2 wins
      b = recordBracketResult(b, 'R1M4', 'A'); // e3 wins
      // SF: now R2M1 = e1 vs e4, R2M2 = e2 vs e3.
      const sf1 = findBracketMatch(b, 'R2M1')!;
      expect(sf1.slotA).toMatchObject({ entryId: 'e1' });
      expect(sf1.slotB).toMatchObject({ entryId: 'e4' });
      b = recordBracketResult(b, 'R2M1', 'A'); // e1 wins
      b = recordBracketResult(b, 'R2M2', 'A'); // e2 wins
      // Final: e1 vs e2.
      const final = findBracketMatch(b, 'R3M1')!;
      expect(final.slotA).toMatchObject({ entryId: 'e1' });
      expect(final.slotB).toMatchObject({ entryId: 'e2' });
      expect(getBracketChampion(b)).toBeNull();
      b = recordBracketResult(b, 'R3M1', 'A');
      expect(getBracketChampion(b)).toMatchObject({ kind: 'entry', entryId: 'e1' });
    });

    it('throws MATCH_NOT_FOUND for unknown matchId', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      expect(() => recordBracketResult(b, 'R9M9', 'A')).toThrow(BracketProgressError);
    });

    it('throws MATCH_ALREADY_DECIDED on second write', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      const after = recordBracketResult(b, 'R1M1', 'A');
      try {
        recordBracketResult(after, 'R1M1', 'B');
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BracketProgressError);
        expect((err as BracketProgressError).code).toBe('MATCH_ALREADY_DECIDED');
      }
    });

    it('throws SLOT_NOT_DETERMINED when target slot is still winner_of', () => {
      const entries = [1, 2, 3, 4].map((s) => mkEntry(`e${s}`, s));
      const b = generateSingleEliminationBracket(entries);
      // R2M1 slots are both winner_of (no QF decided yet).
      try {
        recordBracketResult(b, 'R2M1', 'A');
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BracketProgressError);
        expect((err as BracketProgressError).code).toBe('SLOT_NOT_DETERMINED');
      }
    });

    it('throws INVALID_WINNER for non-A/B winner', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      try {
        recordBracketResult(b, 'R1M1', 'X' as unknown as 'A');
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BracketProgressError);
        expect((err as BracketProgressError).code).toBe('INVALID_WINNER');
      }
    });

    it('is pure: does not mutate input bracket', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      const before = JSON.parse(JSON.stringify(b));
      recordBracketResult(b, 'R1M1', 'A');
      expect(b).toEqual(before);
    });
  });

  describe('getBracketChampion', () => {
    it('returns null while final undecided', () => {
      const b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      expect(getBracketChampion(b)).toBeNull();
    });

    it('returns champion entry slot when final decided', () => {
      let b = generateSingleEliminationBracket([mkEntry('a', 1), mkEntry('b', 2)]);
      b = recordBracketResult(b, 'R1M1', 'B');
      expect(getBracketChampion(b)).toMatchObject({ kind: 'entry', entryId: 'b' });
    });
  });
});
