import { cardId, type Card, type Rank } from './cards.js';
import { recognize } from './patterns.js';
import { compare } from './compare.js';

export interface PlayValidationContext {
  hand: Card[];
  /** 当前桌面顶张（同一墩里上一手非 pass 的牌）。null 表示新墩，玩家任意起手。 */
  currentTrickTop: { cards: Card[] } | null;
  /** 当前级牌（2..A）。 */
  level: Rank;
}

export interface PlayValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * 校验玩家出牌是否合法。
 *  1. play 必须是手牌的"子多重集"（按物理牌 cardId 计数）；
 *  2. play 必须识别为合法牌型；
 *  3. 若有 currentTrickTop，必须能压过它（compare > 0）。
 */
export function validatePlay(play: Card[], ctx: PlayValidationContext): PlayValidationResult {
  if (!play || play.length === 0) return { ok: false, reason: 'EMPTY_PLAY' };

  // 1. 手牌包含校验（按物理牌 ID 多重集计数）
  const handCount = new Map<string, number>();
  for (const c of ctx.hand) handCount.set(cardId(c), (handCount.get(cardId(c)) ?? 0) + 1);
  for (const c of play) {
    const id = cardId(c);
    const left = handCount.get(id) ?? 0;
    if (left <= 0) return { ok: false, reason: `CARD_NOT_IN_HAND:${id}` };
    handCount.set(id, left - 1);
  }

  // 2. 牌型识别
  const myPattern = recognize(play, ctx.level);
  if (!myPattern) return { ok: false, reason: 'ILLEGAL_PATTERN' };

  // 3. 跟牌比较
  if (ctx.currentTrickTop !== null) {
    const top = recognize(ctx.currentTrickTop.cards, ctx.level);
    if (!top) return { ok: false, reason: 'ILLEGAL_TOP_STATE' };
    const cmp = compare(top, myPattern);
    if (cmp <= 0) return { ok: false, reason: 'CANNOT_BEAT_TOP' };
  }

  return { ok: true };
}
