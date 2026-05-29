import { describe, expect, it } from 'vitest';
import { decideMove } from '../strategy.js';
import type { Card } from '@teams-guandan/game-engine';

function n(suit: 'S' | 'H' | 'D' | 'C', rank: string, deck: 0 | 1 = 0): Card {
  return { kind: 'normal', suit, rank: rank as Card['kind'] extends 'normal' ? never : never, deck } as Card;
}
// 用 any 简化测试；strategy 内部已严格类型
function card(suit: any, rank: any, deck: 0 | 1 = 0): Card {
  return { kind: 'normal', suit, rank, deck };
}

const counts = { N: 27, E: 27, S: 27, W: 27 };

describe('decideMove', () => {
  it('lead: easy picks smallest single', () => {
    const hand = [card('S', '3'), card('H', '6'), card('D', 'K')];
    const d = decideMove({ hand, top: null, level: '2', remainingCounts: counts, seat: 'N' }, 'easy');
    expect(d.kind).toBe('play');
    if (d.kind === 'play') expect(d.cardIds).toEqual(['S-3-0']);
  });

  it('follow: passes when cannot beat (non-bomb hand)', () => {
    const hand = [card('S', '3'), card('H', '4')];
    const top = { cards: [card('S', 'A'), card('H', 'A')] };
    const d = decideMove({ hand, top, level: '2', remainingCounts: counts, seat: 'N' }, 'normal');
    expect(d.kind).toBe('pass');
  });

  it('follow: plays smallest beat (non-bomb)', () => {
    const hand = [card('S', '6'), card('S', 'A')];
    const top = { cards: [card('H', '5')] };
    const d = decideMove({ hand, top, level: '2', remainingCounts: counts, seat: 'N' }, 'normal');
    expect(d.kind).toBe('play');
    if (d.kind === 'play') expect(d.cardIds).toEqual(['S-6-0']);
  });

  it('normal: holds bomb when opponents not close', () => {
    const hand = [card('S', '5'), card('H', '5'), card('D', '5'), card('C', '5')];
    const top = { cards: [card('S', 'A')] };
    const d = decideMove(
      { hand, top, level: '2', remainingCounts: { N: 4, E: 20, S: 27, W: 25 }, seat: 'N' },
      'normal',
    );
    expect(d.kind).toBe('pass');
  });

  it('normal: uses bomb when opponent close to win', () => {
    const hand = [card('S', '5'), card('H', '5'), card('D', '5'), card('C', '5')];
    const top = { cards: [card('S', 'A')] };
    const d = decideMove(
      { hand, top, level: '2', remainingCounts: { N: 27, E: 3, S: 27, W: 27 }, seat: 'N' },
      'normal',
    );
    expect(d.kind).toBe('play');
  });

  it('hard: uses bomb under pressure even with healthy opponents', () => {
    const hand = [card('S', '5'), card('H', '5'), card('D', '5'), card('C', '5')];
    const top = { cards: [card('S', 'A')] };
    // self has 4 cards left → pressure > 0.8
    const d = decideMove(
      { hand, top, level: '2', remainingCounts: { N: 4, E: 15, S: 27, W: 15 }, seat: 'N' },
      'hard',
    );
    expect(d.kind).toBe('play');
  });

  it('responds in <50ms on 27-card hand', () => {
    const hand: Card[] = [];
    const suits: any[] = ['S', 'H', 'D', 'C'];
    const ranks: any[] = ['2', '3', '4', '5', '6', '7'];
    for (let i = 0; i < 27; i++) {
      hand.push(card(suits[i % 4], ranks[i % 6], (i % 2) as 0 | 1));
    }
    const start = Date.now();
    decideMove({ hand, top: null, level: '2', remainingCounts: counts, seat: 'N' }, 'hard');
    expect(Date.now() - start).toBeLessThan(50);
  });
});
