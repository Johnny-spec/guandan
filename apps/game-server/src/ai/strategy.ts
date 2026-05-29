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

export interface BotDecisionInput {
  hand: Card[];
  top: { cards: Card[] } | null;
  level: Rank;
  remainingCounts: Record<'N' | 'E' | 'S' | 'W', number>;
  seat: 'N' | 'E' | 'S' | 'W';
}

export type BotDecision = { kind: 'play'; cardIds: string[] } | { kind: 'pass' };

function gamePressure(input: BotDecisionInput): number {
  const my = input.remainingCounts[input.seat];
  return 1 - my / 27;
}

function rateLead(play: Card[], level: Rank): number {
  const r = recognize(play, level)!;
  const bombPenalty =
    r.kind === 'bomb' || r.kind === 'rocket' || r.kind === 'straight-flush' ? 1e6 : 0;
  const sizeBonus = (play.length - 1) * 0.1;
  return r.primaryWeight + bombPenalty - sizeBonus;
}

function rateFollow(play: Card[], level: Rank): number {
  const r = recognize(play, level)!;
  const isBomb = r.kind === 'bomb' || r.kind === 'rocket' || r.kind === 'straight-flush';
  return (isBomb ? 1e6 : 0) + r.primaryWeight;
}

/**
 * 纯函数 AI 决策（<10ms）。
 * easy   — 跟牌取最小（含炸）；起手最小单张。
 * normal — 跟牌取最小非炸，否则 pass；起手优先多牌型。
 * hard   — normal + 终局或对手压力大时愿意用炸。
 *
 * AI 仅能看到：自己手牌 + 桌面 top + 公开剩余张数。
 * 严格不接收其他玩家手牌（防作弊）。
 */
export function decideMove(input: BotDecisionInput, difficulty: Difficulty): BotDecision {
  const plays = enumerateBasicPlays(input.hand, input.top, input.level);

  if (input.top === null) {
    if (plays.length === 0) {
      // 兜底：手牌非空必能出单张
      const c = input.hand[0]!;
      return { kind: 'play', cardIds: [cardId(c)] };
    }
    const pool = [...plays].sort((a, b) => rateLead(a, input.level) - rateLead(b, input.level));
    return { kind: 'play', cardIds: pool[0]!.map(cardId) };
  }

  if (plays.length === 0) return { kind: 'pass' };

  const sorted = [...plays].sort((a, b) => rateFollow(a, input.level) - rateFollow(b, input.level));
  const smallest = sorted[0]!;
  const sp = recognize(smallest, input.level)!;
  const isBomb = sp.kind === 'bomb' || sp.kind === 'rocket' || sp.kind === 'straight-flush';

  if (!isBomb) {
    return { kind: 'play', cardIds: smallest.map(cardId) };
  }

  const pressure = gamePressure(input);
  const partnerSeat = input.seat === 'N' ? 'S' : input.seat === 'S' ? 'N' : input.seat === 'E' ? 'W' : 'E';
  const oppSeats = (['N', 'E', 'S', 'W'] as const).filter(
    (s) => s !== input.seat && s !== partnerSeat,
  );
  const opponentClose = Math.min(...oppSeats.map((s) => input.remainingCounts[s]));

  if (difficulty === 'easy') return { kind: 'play', cardIds: smallest.map(cardId) };
  if (difficulty === 'normal') {
    if (opponentClose <= 5) return { kind: 'play', cardIds: smallest.map(cardId) };
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
