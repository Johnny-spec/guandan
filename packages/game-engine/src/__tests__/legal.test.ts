import { describe, expect, it } from 'vitest';
import { enumerateBasicPlays } from '../legal.js';
import { cards, j, n } from './helpers.js';
import { recognize } from '../patterns.js';

describe('enumerateBasicPlays', () => {
  it('lead: only basic plays returned, all legal', () => {
    const hand = cards(n('S', '3'), n('H', '3'), n('D', '4'), n('S', 'K'), n('C', 'A'));
    const plays = enumerateBasicPlays(hand, null, '2');
    // 5 singles + 1 pair (33) = 6
    expect(plays.length).toBe(6);
    for (const p of plays) expect(recognize(p, '2')).not.toBeNull();
  });

  it('follow: only plays beating top are returned', () => {
    const hand = cards(n('S', '5'), n('H', '6'), n('D', '7'), n('C', 'A'));
    const top = { cards: cards(n('S', '4')) };
    const plays = enumerateBasicPlays(hand, top, '2');
    // 单张 5/6/7/A 都能压 4
    expect(plays.length).toBe(4);
    for (const p of plays) expect(p.length).toBe(1);
  });

  it('follow with no beat: returns empty', () => {
    const hand = cards(n('S', '3'), n('H', '4'));
    const top = { cards: cards(n('S', 'A'), n('H', 'A')) };
    const plays = enumerateBasicPlays(hand, top, '2');
    expect(plays.length).toBe(0);
  });

  it('bomb beats non-bomb of different kind', () => {
    const hand = cards(n('S', '5'), n('H', '5'), n('D', '5'), n('C', '5'));
    const top = { cards: cards(n('S', 'A')) };
    const plays = enumerateBasicPlays(hand, top, '2');
    // 4 单张本不能压 A 但 4 张 5 是炸弹
    const has4Bomb = plays.some((p) => p.length === 4);
    expect(has4Bomb).toBe(true);
  });

  it('rocket: 4 jokers enumerated', () => {
    const hand = cards(j('red', 0), j('red', 1), j('black', 0), j('black', 1));
    const plays = enumerateBasicPlays(hand, null, '2');
    const rocket = plays.find((p) => p.length === 4);
    expect(rocket).toBeDefined();
    expect(recognize(rocket!, '2')!.kind).toBe('rocket');
  });
});
