import type { Card, JokerCard, NormalCard, Rank, Suit } from '../cards.js';

export function n(suit: Suit, rank: Rank, deck: 0 | 1 = 0): NormalCard {
  return { kind: 'normal', suit, rank, deck };
}

export function j(color: 'red' | 'black', deck: 0 | 1 = 0): JokerCard {
  return { kind: 'joker', color, deck };
}

/** 红心级牌（百搭）。 */
export function wild(level: Rank, deck: 0 | 1 = 0): NormalCard {
  return n('H', level, deck);
}

export function cards(...cs: Card[]): Card[] {
  return cs;
}
