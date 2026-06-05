import {
  cardId,
  decodeCardId,
  enumerateBasicPlays,
  pointValueOf,
  recognize,
  type Card,
  type Rank,
} from '@teams-guandan/game-engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type SeatCode = 'N' | 'E' | 'S' | 'W';

export interface BotDecisionInput {
  hand: Card[];
  top: { cards: Card[] } | null;
  /**
   * 桌面顶张的所有者。仅 `top !== null` 时有意义。
   * 用于 hard 模式队友信号：如果 top 是搭档出的，更倾向于 pass，让搭档保持主动权。
   * 兼容旧调用方：缺省时 partner-aware 策略不触发。
   */
  topOwnerSeat?: SeatCode;
  level: Rank;
  remainingCounts: Record<SeatCode, number>;
  seat: SeatCode;
}

export type BotDecision = { kind: 'play'; cardIds: string[] } | { kind: 'pass' };

function partnerOf(seat: SeatCode): SeatCode {
  return seat === 'N' ? 'S' : seat === 'S' ? 'N' : seat === 'E' ? 'W' : 'E';
}

function gamePressure(input: BotDecisionInput): number {
  const my = input.remainingCounts[input.seat];
  return 1 - my / 27;
}

function rateLead(play: Card[], level: Rank, sizeBonusFactor: number): number {
  const r = recognize(play, level)!;
  const bombPenalty =
    r.kind === 'bomb' || r.kind === 'rocket' || r.kind === 'straight-flush' ? 1e6 : 0;
  // 多牌型奖励：单牌不奖励，越大的组合越倾向于在 lead 时打出（手牌消耗更快）。
  const sizeBonus = (play.length - 1) * sizeBonusFactor;
  return r.primaryWeight + bombPenalty - sizeBonus;
}

function rateFollow(play: Card[], level: Rank): number {
  const r = recognize(play, level)!;
  const isBomb = r.kind === 'bomb' || r.kind === 'rocket' || r.kind === 'straight-flush';
  return (isBomb ? 1e6 : 0) + r.primaryWeight;
}

/**
 * 纯函数 AI 决策（<10ms）。
 *
 * easy   — 跟牌取最小（含炸）；起手最小单张优先。
 * normal — 跟牌取最小非炸，否则 pass；起手按 rateLead 排序；对手 ≤5 张时被动用炸。
 * hard   — normal + 终局或对手压力大时愿意用炸 + 队友信号（不压队友、队友将赢则不浪费炸）
 *          + 起手更偏好多牌组合（手牌消耗更快）。
 *
 * AI 仅能看到：自己手牌 + 桌面 top（含 topOwnerSeat）+ 公开剩余张数。
 * 严格不接收其他玩家手牌（防作弊）。
 */
export function decideMove(input: BotDecisionInput, difficulty: Difficulty): BotDecision {
  const plays = enumerateBasicPlays(input.hand, input.top, input.level);

  // ----- 起手 -----
  if (input.top === null) {
    if (plays.length === 0) {
      // 兜底：手牌非空必能出单张
      const c = input.hand[0]!;
      return { kind: 'play', cardIds: [cardId(c)] };
    }
    // hard 模式更鼓励出多牌（sizeBonusFactor 0.25 > 0.1），加快手牌消耗
    const sizeBonusFactor = difficulty === 'hard' ? 0.25 : 0.1;
    const pool = [...plays].sort(
      (a, b) => rateLead(a, input.level, sizeBonusFactor) - rateLead(b, input.level, sizeBonusFactor),
    );
    return { kind: 'play', cardIds: pool[0]!.map(cardId) };
  }

  // ----- 跟牌 -----
  if (plays.length === 0) return { kind: 'pass' };

  const sorted = [...plays].sort((a, b) => rateFollow(a, input.level) - rateFollow(b, input.level));
  const smallest = sorted[0]!;
  const sp = recognize(smallest, input.level)!;
  const isBomb = sp.kind === 'bomb' || sp.kind === 'rocket' || sp.kind === 'straight-flush';

  const partnerSeat = partnerOf(input.seat);
  const partnerRemaining = input.remainingCounts[partnerSeat];
  const partnerOwnsTop = input.topOwnerSeat === partnerSeat;
  const oppSeats = (['N', 'E', 'S', 'W'] as const).filter(
    (s) => s !== input.seat && s !== partnerSeat,
  );
  const opponentClose = Math.min(...oppSeats.map((s) => input.remainingCounts[s]));
  const pressure = gamePressure(input);
  const myRemaining = input.remainingCounts[input.seat];

  // ----- hard 模式队友信号 -----
  // 队友出的牌，且队友手牌不多且对手不威胁 → 让位给队友，pass 不压
  if (
    difficulty === 'hard' &&
    partnerOwnsTop &&
    partnerRemaining <= 8 &&
    opponentClose > partnerRemaining &&
    myRemaining >= 6
  ) {
    return { kind: 'pass' };
  }

  if (!isBomb) {
    return { kind: 'play', cardIds: smallest.map(cardId) };
  }

  // ----- 炸弹决策 -----
  if (difficulty === 'easy') return { kind: 'play', cardIds: smallest.map(cardId) };

  if (difficulty === 'normal') {
    if (opponentClose <= 5) return { kind: 'play', cardIds: smallest.map(cardId) };
    return { kind: 'pass' };
  }

  // hard：队友马上要赢（≤3 张）就别浪费炸帮他清桌
  if (partnerOwnsTop && partnerRemaining <= 3) {
    return { kind: 'pass' };
  }
  if (opponentClose <= 7 || pressure > 0.7) {
    return { kind: 'play', cardIds: smallest.map(cardId) };
  }
  return { kind: 'pass' };
}

export function decodeHand(cardIds: string[]): Card[] {
  const out: Card[] = [];
  for (const id of cardIds) {
    const c = decodeCardId(id);
    if (c) out.push(c);
  }
  return out;
}

export function handStrength(hand: Card[], level: Rank): number {
  return hand.reduce((s, c) => s + pointValueOf(c, level), 0);
}
