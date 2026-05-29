import { cardId, rankKeyOf, type Card, type Rank, type RankKey } from './cards.js';
import { validatePlay } from './validator.js';

/**
 * 枚举一组手牌中所有"基础合法出牌"。
 *
 * v1 限制（覆盖 80%+ 实战场景，AI Bot 使用）：
 *   - 单张
 *   - 对子（同 rankKey 任意 2 张）
 *   - 三张（同 rankKey 任意 3 张）
 *   - 炸弹（同 rankKey 4..n 张）
 *   - 王炸（4 张王）
 *
 * 不枚举：顺子 / 连对 / 钢板 / 三带二 / 同花顺（组合爆炸，留待 Phase 2 MCTS）。
 * 也不主动用百搭组合替换 — 百搭按其物理 rank（红心级牌）参与对/三/炸。
 *
 * top 非 null 时仅返回能压过 top 的牌。
 */
export function enumerateBasicPlays(
  hand: Card[],
  top: { cards: Card[] } | null,
  level: Rank,
): Card[][] {
  const buckets = new Map<RankKey, Card[]>();
  for (const c of hand) {
    const k = rankKeyOf(c);
    const arr = buckets.get(k) ?? [];
    arr.push(c);
    buckets.set(k, arr);
  }

  const candidates: Card[][] = [];

  for (const c of hand) candidates.push([c]);

  for (const arr of buckets.values()) {
    if (arr.length >= 2) candidates.push(arr.slice(0, 2));
    if (arr.length >= 3) candidates.push(arr.slice(0, 3));
    if (arr.length >= 4) {
      // 同 rank 炸弹：4, 5, ..., n
      for (let size = 4; size <= arr.length; size++) {
        candidates.push(arr.slice(0, size));
      }
    }
  }

  const jokers = hand.filter((c) => c.kind === 'joker');
  if (jokers.length === 4) candidates.push(jokers);

  const seen = new Set<string>();
  const out: Card[][] = [];
  for (const play of candidates) {
    const key = play.map(cardId).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const v = validatePlay(play, { hand, currentTrickTop: top, level });
    if (v.ok) out.push(play);
  }
  return out;
}
