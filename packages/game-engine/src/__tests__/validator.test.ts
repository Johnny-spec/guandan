import { describe, expect, it } from 'vitest';
import { validatePlay } from '../validator.js';
import { j, n } from './helpers.js';

describe('validatePlay', () => {
  const hand = [
    n('S', '3'), n('H', '3'),
    n('D', '7'), n('C', '7'), n('S', '7'),
    n('S', '9'),
    n('S', 'K'), n('H', 'K'),
    j('red'),
  ];

  it('空出牌非法', () => {
    const r = validatePlay([], { hand, currentTrickTop: null, level: '2' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('EMPTY_PLAY');
  });

  it('打出不在手里的牌 → 拒绝', () => {
    const r = validatePlay([n('S', '4')], { hand, currentTrickTop: null, level: '2' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CARD_NOT_IN_HAND/);
  });

  it('非法牌型 → 拒绝', () => {
    const r = validatePlay(
      [n('S', '3'), n('D', '7')],
      { hand, currentTrickTop: null, level: '2' },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ILLEGAL_PATTERN');
  });

  it('起手随意（无 top）', () => {
    const r = validatePlay(
      [n('S', '3'), n('H', '3')],
      { hand, currentTrickTop: null, level: '2' },
    );
    expect(r.ok).toBe(true);
  });

  it('压不过 top → 拒绝', () => {
    const r = validatePlay(
      [n('S', '3'), n('H', '3')],
      {
        hand,
        currentTrickTop: { cards: [n('S', '5', 1), n('H', '5', 1)] },
        level: '2',
      },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('CANNOT_BEAT_TOP');
  });

  it('压过 top → 通过', () => {
    const r = validatePlay(
      [n('S', 'K'), n('H', 'K')],
      {
        hand,
        currentTrickTop: { cards: [n('S', '5', 1), n('H', '5', 1)] },
        level: '2',
      },
    );
    expect(r.ok).toBe(true);
  });

  it('炸弹压制对子', () => {
    const r = validatePlay(
      [n('D', '7'), n('C', '7'), n('S', '7'), n('H', '7', 1)],
      {
        hand: [...hand, n('H', '7', 1)],
        currentTrickTop: { cards: [n('S', 'A'), n('H', 'A')] },
        level: '2',
      },
    );
    expect(r.ok).toBe(true);
  });

  it('双副牌检查：相同 rank 不同 deck 视为不同物理牌', () => {
    // hand 里只有 deck=0 的 H-3，尝试出 deck=1 的 H-3 必须被拒
    const r = validatePlay(
      [n('S', '3'), n('H', '3', 1)],
      { hand, currentTrickTop: null, level: '2' },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CARD_NOT_IN_HAND/);
  });
});
