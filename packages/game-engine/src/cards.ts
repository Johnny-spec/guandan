/**
 * 单张扑克牌 — 不可变值对象。
 * 掼蛋使用两副牌（共 108 张），含大小王。
 */
export type Suit = 'S' | 'H' | 'D' | 'C'; // 黑桃 / 红心 / 方块 / 梅花
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

export interface NormalCard {
  readonly kind: 'normal';
  readonly suit: Suit;
  readonly rank: Rank;
  /** 同一物理牌在两副中的标识，0 或 1。 */
  readonly deck: 0 | 1;
}

export interface JokerCard {
  readonly kind: 'joker';
  readonly color: 'red' | 'black';
  readonly deck: 0 | 1;
}

export type Card = NormalCard | JokerCard;

/** 生成一副完整的掼蛋牌（108 张）。 */
export function buildDeck(): Card[] {
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const ranks: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const cards: Card[] = [];
  for (const deck of [0, 1] as const) {
    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push({ kind: 'normal', suit, rank, deck });
      }
    }
    cards.push({ kind: 'joker', color: 'black', deck });
    cards.push({ kind: 'joker', color: 'red', deck });
  }
  return cards;
}

// ---------------------------------------------------------------------------
// 通用工具：rank/joker 排序、点数、级牌、稳定 ID。
// ---------------------------------------------------------------------------

export const RANK_ORDER: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

/** 牌的"自然点数"：2..14（用于顺子/连对/钢板）。 */
export function naturalRankValue(rank: Rank): number {
  return RANK_ORDER.indexOf(rank) + 2;
}

/** 牌的"打点点数"（用于单/对/三/炸）：级牌→15、小王→16、大王→17。 */
export function pointValueOf(card: Card, level: Rank): number {
  if (card.kind === 'joker') return card.color === 'red' ? 17 : 16;
  if (card.rank === level) return 15;
  return naturalRankValue(card.rank);
}

/** 是否为"逢人配"百搭：当前级牌的红心牌（任意副）。 */
export function isWildcard(card: Card, level: Rank): boolean {
  return card.kind === 'normal' && card.suit === 'H' && card.rank === level;
}

/** 取牌的"点数键"：normal→rank，joker→'SJ'/'BJ'。 */
export type RankKey = Rank | 'SJ' | 'BJ';
export function rankKeyOf(card: Card): RankKey {
  return card.kind === 'joker' ? (card.color === 'red' ? 'BJ' : 'SJ') : card.rank;
}

/** 稳定的牌唯一 ID — 用于手牌包含校验。 */
export function cardId(card: Card): string {
  return card.kind === 'joker'
    ? `J-${card.color}-${card.deck}`
    : `${card.suit}-${card.rank}-${card.deck}`;
}

/** 按点数从小到大排序（级牌算 15，王最大）。 */
export function sortByPoint(cards: Card[], level: Rank): Card[] {
  return [...cards].sort((a, b) => pointValueOf(a, level) - pointValueOf(b, level));
}

/** Fisher–Yates 洗牌（不可变：返回新数组）。可注入随机源便于测试。 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 把一副 108 张牌平均发给 4 家（每家 27 张）。 */
export function dealHands(deck: readonly Card[]): [Card[], Card[], Card[], Card[]] {
  if (deck.length !== 108) throw new Error(`expected 108 cards, got ${deck.length}`);
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) hands[i % 4]!.push(deck[i]!);
  return hands as [Card[], Card[], Card[], Card[]];
}

// ---------------------------------------------------------------------------
// 线序列化：cardId ↔ Card
// ---------------------------------------------------------------------------

/** 把 cardId 反序列化为 Card。非法返回 null。 */
export function decodeCardId(id: string): Card | null {
  const parts = id.split('-');
  if (parts.length !== 3) return null;
  const [a, b, c] = parts as [string, string, string];
  const deck = c === '0' ? 0 : c === '1' ? 1 : null;
  if (deck === null) return null;
  if (a === 'J') {
    if (b !== 'red' && b !== 'black') return null;
    return { kind: 'joker', color: b, deck };
  }
  if (a !== 'S' && a !== 'H' && a !== 'D' && a !== 'C') return null;
  if (!RANK_ORDER.includes(b as Rank)) return null;
  return { kind: 'normal', suit: a, rank: b as Rank, deck };
}
