import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationBracket,
  standardSeedOrder,
  type Bracket,
} from '../tournament/bracket.js';
import type { TournamentEntryRecord } from '../tournament/tournament.repository.js';

function mkEntry(
  id: string,
  seed: number | null,
  teamName = `T${id}`,
  registeredAt = `2026-06-08T00:00:0${id.slice(-1)}Z`,
): TournamentEntryRecord {
  return {
    id,
    tournamentId: 't1',
    captainUserId: `cap-${id}`,
    partnerUserId: null,
    teamName,
    seed,
    status: 'CONFIRMED',
    registeredAt,
    withdrawnAt: null,
  };
}

describe('standardSeedOrder', () => {
  it('returns [1,2] for slotCount=2', () => {
    expect(standardSeedOrder(2)).toEqual([1, 2]);
  });

  it('returns [1,4,2,3] for slotCount=4 (1 and 2 in different halves)', () => {
    expect(standardSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it('returns [1,8,4,5,2,7,3,6] for slotCount=8', () => {
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('rejects non-power-of-2 slotCount', () => {
    expect(() => standardSeedOrder(3)).toThrow(/power of 2/);
    expect(() => standardSeedOrder(0)).toThrow(/power of 2/);
  });
});

describe('generateSingleEliminationBracket', () => {
  it('rejects fewer than 2 entries', () => {
    expect(() => generateSingleEliminationBracket([])).toThrow(/at least 2/);
    expect(() => generateSingleEliminationBracket([mkEntry('1', 1)])).toThrow(/at least 2/);
  });

  it('builds a 2-team final (no byes)', () => {
    const b = generateSingleEliminationBracket([mkEntry('1', 1), mkEntry('2', 2)]);
    expect(b.slotCount).toBe(2);
    expect(b.totalRounds).toBe(1);
    expect(b.rounds).toHaveLength(1);
    expect(b.rounds[0]!.name).toBe('Final');
    expect(b.rounds[0]!.matches).toHaveLength(1);
    const m = b.rounds[0]!.matches[0]!;
    expect(m.matchId).toBe('R1M1');
    expect(m.slotA).toMatchObject({ kind: 'entry', entryId: '1', seed: 1 });
    expect(m.slotB).toMatchObject({ kind: 'entry', entryId: '2', seed: 2 });
    expect(m.preDeterminedWinner).toBeNull();
  });

  it('builds a 4-team bracket: seed 1 vs 4 / 2 vs 3 in different halves', () => {
    const b = generateSingleEliminationBracket([
      mkEntry('a', 1),
      mkEntry('b', 2),
      mkEntry('c', 3),
      mkEntry('d', 4),
    ]);
    expect(b.slotCount).toBe(4);
    expect(b.totalRounds).toBe(2);
    expect(b.rounds.map((r) => r.name)).toEqual(['Semifinal', 'Final']);
    const sf = b.rounds[0]!.matches;
    expect(sf).toHaveLength(2);
    expect(sf[0]!.slotA).toMatchObject({ kind: 'entry', entryId: 'a', seed: 1 });
    expect(sf[0]!.slotB).toMatchObject({ kind: 'entry', entryId: 'd', seed: 4 });
    expect(sf[1]!.slotA).toMatchObject({ kind: 'entry', entryId: 'b', seed: 2 });
    expect(sf[1]!.slotB).toMatchObject({ kind: 'entry', entryId: 'c', seed: 3 });
    expect(b.rounds[1]!.matches).toHaveLength(1);
    expect(b.rounds[1]!.matches[0]!.slotA).toEqual({ kind: 'winner_of', matchId: 'R1M1' });
    expect(b.rounds[1]!.matches[0]!.slotB).toEqual({ kind: 'winner_of', matchId: 'R1M2' });
  });

  it('assigns byes to top seeds (3 teams)', () => {
    const b = generateSingleEliminationBracket([
      mkEntry('a', 1),
      mkEntry('b', 2),
      mkEntry('c', 3),
    ]);
    expect(b.slotCount).toBe(4);
    const r1 = b.rounds[0]!.matches;
    expect(r1[0]!.slotA).toMatchObject({ kind: 'entry', seed: 1 });
    expect(r1[0]!.slotB).toEqual({ kind: 'bye' });
    expect(r1[0]!.preDeterminedWinner).toBe('A');
    expect(r1[1]!.slotA).toMatchObject({ kind: 'entry', seed: 2 });
    expect(r1[1]!.slotB).toMatchObject({ kind: 'entry', seed: 3 });
    expect(r1[1]!.preDeterminedWinner).toBeNull();
  });

  it('handles 5 teams: byes for seeds 1,2,3', () => {
    const entries = [1, 2, 3, 4, 5].map((s) => mkEntry(`e${s}`, s));
    const b = generateSingleEliminationBracket(entries);
    expect(b.slotCount).toBe(8);
    expect(b.totalRounds).toBe(3);
    const r1 = b.rounds[0]!.matches;
    expect(r1).toHaveLength(4);
    // standard order [1,8,4,5,2,7,3,6] -> missing 6/7/8 become bye
    expect(r1[0]!.slotA).toMatchObject({ seed: 1 });
    expect(r1[0]!.slotB).toEqual({ kind: 'bye' });
    expect(r1[1]!.slotA).toMatchObject({ seed: 4 });
    expect(r1[1]!.slotB).toMatchObject({ seed: 5 });
    expect(r1[2]!.slotA).toMatchObject({ seed: 2 });
    expect(r1[2]!.slotB).toEqual({ kind: 'bye' });
    expect(r1[3]!.slotA).toMatchObject({ seed: 3 });
    expect(r1[3]!.slotB).toEqual({ kind: 'bye' });
    expect(r1[1]!.preDeterminedWinner).toBeNull();
    expect(r1[0]!.preDeterminedWinner).toBe('A');
    expect(r1[2]!.preDeterminedWinner).toBe('A');
    expect(r1[3]!.preDeterminedWinner).toBe('A');
  });

  it('builds a full 8-team bracket with 3 rounds (QF/SF/Final)', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => mkEntry(`e${s}`, s));
    const b: Bracket = generateSingleEliminationBracket(entries);
    expect(b.slotCount).toBe(8);
    expect(b.totalRounds).toBe(3);
    expect(b.rounds.map((r) => r.name)).toEqual(['Quarterfinal', 'Semifinal', 'Final']);
    expect(b.rounds[0]!.matches).toHaveLength(4);
    expect(b.rounds[1]!.matches).toHaveLength(2);
    expect(b.rounds[2]!.matches).toHaveLength(1);

    for (let r = 1; r < b.rounds.length; r++) {
      for (const m of b.rounds[r]!.matches) {
        expect(m.slotA.kind).toBe('winner_of');
        expect(m.slotB.kind).toBe('winner_of');
        expect(m.preDeterminedWinner).toBeNull();
      }
    }

    const sfIds = b.rounds[1]!.matches.flatMap((m) => [
      (m.slotA as { matchId: string }).matchId,
      (m.slotB as { matchId: string }).matchId,
    ]);
    expect(new Set(sfIds)).toEqual(new Set(['R1M1', 'R1M2', 'R1M3', 'R1M4']));
  });

  it('falls back to registeredAt order for missing / duplicated seeds', () => {
    const entries = [
      mkEntry('a', null, 'A', '2026-06-08T00:00:01Z'),
      mkEntry('b', null, 'B', '2026-06-08T00:00:02Z'),
      mkEntry('c', 1, 'C', '2026-06-08T00:00:03Z'),
      mkEntry('d', 1, 'D', '2026-06-08T00:00:04Z'),
    ];
    const b = generateSingleEliminationBracket(entries);
    // rank: c(1, seed=1 earliest) / d(2, seed=1 later) / a(3, null seed earliest) / b(4)
    const r1 = b.rounds[0]!.matches;
    expect((r1[0]!.slotA as { entryId: string }).entryId).toBe('c');
    expect((r1[0]!.slotB as { entryId: string }).entryId).toBe('b');
    expect((r1[1]!.slotA as { entryId: string }).entryId).toBe('d');
    expect((r1[1]!.slotB as { entryId: string }).entryId).toBe('a');
  });
});
