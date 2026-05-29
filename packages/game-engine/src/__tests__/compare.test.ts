import { describe, expect, it } from 'vitest';
import { compare } from '../compare.js';
import { recognize } from '../patterns.js';
import { j, n } from './helpers.js';

function rec(cs: Parameters<typeof recognize>[0], level: Parameters<typeof recognize>[1]) {
  const p = recognize(cs, level);
  if (!p) throw new Error('expected recognized pattern');
  return p;
}

describe('compare', () => {
  it('同型对子：大压小', () => {
    const a = rec([n('S', '7'), n('H', '7')], '2');
    const b = rec([n('S', '9'), n('H', '9')], '2');
    expect(compare(a, b)).toBeGreaterThan(0);
  });

  it('不同型 → 不可比', () => {
    const a = rec([n('S', '7')], '2');
    const b = rec([n('S', '9'), n('H', '9')], '2');
    expect(compare(a, b)).toBe(0);
  });

  it('炸弹压制非炸', () => {
    const a = rec([n('S', '9'), n('H', '9'), n('D', '9')], '2');
    const b = rec([n('S', '5'), n('H', '5'), n('D', '5'), n('C', '5')], '2');
    expect(compare(a, b)).toBeGreaterThan(0);
  });

  it('5 炸压 4 炸', () => {
    const a = rec(
      [n('S', '9'), n('H', '9'), n('D', '9'), n('C', '9')],
      '2',
    );
    const b = rec(
      [n('S', '5'), n('H', '5'), n('D', '5'), n('C', '5'), n('S', '5', 1)],
      '2',
    );
    expect(compare(a, b)).toBeGreaterThan(0);
  });

  it('同花顺 > 6 炸', () => {
    const sixBomb = rec(
      [
        n('S', '9', 0), n('H', '9', 0), n('D', '9', 0), n('C', '9', 0),
        n('S', '9', 1), n('H', '9', 1),
      ],
      '2',
    );
    const sf = rec(
      [n('S', '3'), n('S', '4'), n('S', '5'), n('S', '6'), n('S', '7')],
      '2',
    );
    expect(compare(sixBomb, sf)).toBeGreaterThan(0);
  });

  it('7 炸 > 同花顺', () => {
    const sf = rec(
      [n('S', '3'), n('S', '4'), n('S', '5'), n('S', '6'), n('S', '7')],
      '2',
    );
    const sevenBomb = rec(
      [
        n('S', '9', 0), n('H', '9', 0), n('D', '9', 0), n('C', '9', 0),
        n('S', '9', 1), n('H', '9', 1), n('D', '9', 1),
      ],
      '2',
    );
    expect(compare(sf, sevenBomb)).toBeGreaterThan(0);
  });

  it('王炸通杀', () => {
    const sevenBomb = rec(
      [
        n('S', '9', 0), n('H', '9', 0), n('D', '9', 0), n('C', '9', 0),
        n('S', '9', 1), n('H', '9', 1), n('D', '9', 1),
      ],
      '2',
    );
    const rocket = rec(
      [j('black', 0), j('black', 1), j('red', 0), j('red', 1)],
      '2',
    );
    expect(compare(sevenBomb, rocket)).toBeGreaterThan(0);
  });

  it('同型不同长度不可比（两个不同长度的顺子）', () => {
    // 两个顺子比较 — 长度都是 5，应可比；测试三带二 vs 三张
    const triple = rec([n('S', '7'), n('H', '7'), n('D', '7')], '2');
    const triplePair = rec(
      [n('S', '8'), n('H', '8'), n('D', '8'), n('S', '4'), n('H', '4')],
      '2',
    );
    expect(compare(triple, triplePair)).toBe(0);
  });

  it('级牌单张 > A 单张', () => {
    const ace = rec([n('S', 'A')], '5');
    const lvl = rec([n('D', '5')], '5');
    expect(compare(ace, lvl)).toBeGreaterThan(0);
  });
});
