import { describe, expect, it } from 'vitest';
import type { Seat } from '@teams-guandan/shared-types';
import { GameSession } from '../game/game.session.js';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeSession(seed = 42) {
  const seats = new Map<Seat, string>([
    ['N', 'u1'],
    ['E', 'u2'],
    ['S', 'u3'],
    ['W', 'u4'],
  ]);
  return new GameSession('r1', '2', seats, seededRng(seed));
}

describe('GameSession', () => {
  it('开局每家 27 张，N 先出', () => {
    const s = makeSession();
    expect(s.handCount('N')).toBe(27);
    expect(s.handCount('E')).toBe(27);
    expect(s.handCount('S')).toBe(27);
    expect(s.handCount('W')).toBe(27);
    const snap = s.snapshotFor('u1', []);
    expect(snap.public.turnSeat).toBe('N');
    expect(snap.private.seat).toBe('N');
    expect(snap.private.cardIds).toHaveLength(27);
  });

  it('非自己回合出牌被拒', () => {
    const s = makeSession();
    const r = s.play('E', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_YOUR_TURN');
  });

  it('打出不在手里的牌 → INVALID_PLAY', () => {
    const s = makeSession();
    const handIds = new Set(s.snapshotFor('u1', []).private.cardIds);
    const candidates = ['S-3-0', 'S-3-1', 'H-3-0', 'D-3-0', 'C-3-0', 'S-4-0'];
    const unknown = candidates.find((c) => !handIds.has(c))!;
    const r = s.play('N', [unknown]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_PLAY');
  });

  it('N 出 1 张 → 顶张更新，回合推进到 E', () => {
    const s = makeSession();
    const hand = s.snapshotFor('u1', []).private.cardIds;
    const r = s.play('N', [hand[0]!]);
    expect(r.ok).toBe(true);
    const snap = s.snapshotFor('u1', []);
    expect(snap.public.turnSeat).toBe('E');
    expect(snap.public.currentTrickTop?.seat).toBe('N');
    expect(snap.private.cardIds).toHaveLength(26);
  });

  it('无顶张时 pass 被拒', () => {
    const s = makeSession();
    const r = s.pass('N');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CANNOT_PASS');
  });

  it('3 连 pass → 收墩，墩主续手', () => {
    const s = makeSession();
    const handN = s.snapshotFor('u1', []).private.cardIds;
    expect(s.play('N', [handN[0]!]).ok).toBe(true);
    expect(s.pass('E').ok).toBe(true);
    expect(s.pass('S').ok).toBe(true);
    const last = s.pass('W');
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.trickClosed).toBe(true);
      expect(last.nextLead).toBe('N');
    }
    const snap = s.snapshotFor('u1', []);
    expect(snap.public.currentTrickTop).toBeNull();
    expect(snap.public.turnSeat).toBe('N');
  });

  it('snapshotFor 只暴露自己的手牌', () => {
    const s = makeSession();
    const me = s.snapshotFor('u1', []);
    const them = s.snapshotFor('u2', []);
    expect(me.private.seat).toBe('N');
    expect(them.private.seat).toBe('E');
    expect(me.private.cardIds).not.toEqual(them.private.cardIds);
  });
});
