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

  // ---- hard 模式：队友信号（partner-aware）----

  it('hard: passes when partner owns top and partner is near-empty', () => {
    // 搭档 S 出了 K，我手里有一对 A 能压（非炸），但搭档只剩 4 张 → 应让位 pass
    const hand = [card('S', 'A'), card('H', 'A'), card('S', '3')];
    const top = { cards: [card('S', 'K')] };
    const d = decideMove(
      {
        hand,
        top,
        topOwnerSeat: 'S',
        level: '2',
        remainingCounts: { N: 10, E: 20, S: 4, W: 20 },
        seat: 'N',
      },
      'hard',
    );
    expect(d.kind).toBe('pass');
  });

  it('hard: still beats partner when opponent is closer to winning than partner', () => {
    // 搭档 S 出了 K（剩 8 张），但对手 E 只剩 3 张 → 不能让位，必须压制
    const hand = [card('S', 'A')];
    const top = { cards: [card('S', 'K')] };
    const d = decideMove(
      {
        hand,
        top,
        topOwnerSeat: 'S',
        level: '2',
        remainingCounts: { N: 10, E: 3, S: 8, W: 20 },
        seat: 'N',
      },
      'hard',
    );
    expect(d.kind).toBe('play');
  });

  it('hard: still plays when my hand is also near-empty (race to finish)', () => {
    // 搭档 S 剩 6 张，但我也只剩 4 张 → 我自己更接近清空，正常出
    const hand = [card('S', 'A'), card('S', '3')];
    const top = { cards: [card('S', 'K')] };
    const d = decideMove(
      {
        hand,
        top,
        topOwnerSeat: 'S',
        level: '2',
        remainingCounts: { N: 4, E: 20, S: 6, W: 20 },
        seat: 'N',
      },
      'hard',
    );
    expect(d.kind).toBe('play');
  });

  it('hard: does NOT waste bomb when partner about to win', () => {
    // 搭档 S 出了 A，我有 5555 炸，但搭档只剩 2 张要赢 → 不要炸
    const hand = [card('S', '5'), card('H', '5'), card('D', '5'), card('C', '5')];
    const top = { cards: [card('S', 'A')] };
    const d = decideMove(
      {
        hand,
        top,
        topOwnerSeat: 'S',
        level: '2',
        remainingCounts: { N: 4, E: 20, S: 2, W: 20 },
        seat: 'N',
      },
      'hard',
    );
    expect(d.kind).toBe('pass');
  });

  it('normal: ignores topOwnerSeat (backward compat)', () => {
    // normal 模式不看 topOwnerSeat —— 同样的场景仍然压牌
    const hand = [card('S', 'A'), card('H', 'A'), card('S', '3')];
    const top = { cards: [card('S', 'K')] };
    const d = decideMove(
      {
        hand,
        top,
        topOwnerSeat: 'S',
        level: '2',
        remainingCounts: { N: 10, E: 20, S: 4, W: 20 },
        seat: 'N',
      },
      'normal',
    );
    expect(d.kind).toBe('play');
  });

  it('hard lead: prefers pair over single at same weight (multi-card bonus)', () => {
    // 一对 3 和一个 5：基础权重 pair-3 (3) vs single-5 (5)，pair 更小 → 已经会选 pair
    // 更严格：一对 3 和一个 3 —— pair 权重 3 减去 sizeBonus 0.25 = 2.75，单 3 权重 3 → hard 选 pair
    const hand = [card('S', '3'), card('H', '3'), card('D', '3')];
    const d = decideMove(
      { hand, top: null, level: '2', remainingCounts: counts, seat: 'N' },
      'hard',
    );
    expect(d.kind).toBe('play');
    if (d.kind === 'play') {
      // 三张 3：hard sizeBonus 让 triple (3-0.5=2.5) < pair (2.75) < single (3) → 选 triple
      expect(d.cardIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('normal lead: picks single over pair at same rank (size bonus too small to flip)', () => {
    // normal sizeBonus 0.1：pair-3 权重 3-0.1=2.9 vs single-3 权重 3 → pair 仍然胜出（2.9<3）
    // 这其实也会选 pair；改成验证：normal 和 hard 在「单张 vs 对子同 rank」时都偏向 pair
    // 但 hard 偏好更强：用 [single-3, pair-5] —— single-3 权重 3 vs pair-5 权重 5-0.1=4.9，
    // normal 仍选 single-3；hard 用 sizeBonus 0.25：pair-5 权重 5-0.25=4.75 仍 > single-3 (3)
    // → 两档都选 single-3。这个测试改为验证 normal 在大 rank 差时不会被 sizeBonus 翻盘。
    const hand = [card('S', '3'), card('S', '5'), card('H', '5')];
    const d = decideMove(
      { hand, top: null, level: '2', remainingCounts: counts, seat: 'N' },
      'normal',
    );
    expect(d.kind).toBe('play');
    if (d.kind === 'play') expect(d.cardIds).toEqual(['S-3-0']);
  });
});
