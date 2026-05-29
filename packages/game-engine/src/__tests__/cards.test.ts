import { describe, it, expect } from 'vitest';
import { buildDeck } from '../cards.js';

describe('cards', () => {
  it('builds a 108-card deck', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(108);
    const jokers = deck.filter((c) => c.kind === 'joker');
    expect(jokers).toHaveLength(4);
  });
});
