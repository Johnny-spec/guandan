import {
  RANK_ORDER,
  isWildcard,
  naturalRankValue,
  pointValueOf,
  rankKeyOf,
  type Card,
  type NormalCard,
  type Rank,
  type RankKey,
} from './cards.js';

/** 牌型枚举 — 详细规则见 docs/02-rules-engine.md。 */
export type PatternKind =
  | 'single'        // 单张
  | 'pair'          // 对子
  | 'triple'        // 三张
  | 'straight'      // 顺子（5 张）
  | 'pair-chain'    // 连对（3 对）
  | 'triple-pair'   // 三带二
  | 'plate'         // 钢板（2 个连续三张）
  | 'bomb'          // 炸弹（4 张及以上同点）
  | 'straight-flush' // 同花顺
  | 'rocket';       // 王炸（双王 × 2）

export interface RecognizedPattern {
  kind: PatternKind;
  /** 主点数权值（同型比大小用）。 */
  primaryWeight: number;
  /** 炸弹/同花顺等额外的张数维度。 */
  length?: number;
  cards: Card[];
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

interface Split {
  wilds: NormalCard[];
  others: Card[];
}

function split(cards: Card[], level: Rank): Split {
  const wilds: NormalCard[] = [];
  const others: Card[] = [];
  for (const c of cards) {
    if (isWildcard(c, level)) wilds.push(c as NormalCard);
    else others.push(c);
  }
  return { wilds, others };
}

function allSameRank(cards: Card[]): RankKey | null {
  if (cards.length === 0) return null;
  const k = rankKeyOf(cards[0]!);
  for (const c of cards) if (rankKeyOf(c) !== k) return null;
  return k;
}

function pointFromKey(key: RankKey, level: Rank): number {
  if (key === 'BJ') return 17;
  if (key === 'SJ') return 16;
  if (key === level) return 15;
  return naturalRankValue(key);
}

// ---------------------------------------------------------------------------
// 单/对/三 — 同点组（百搭可替）
// ---------------------------------------------------------------------------

function trySingle(cards: Card[], level: Rank): RecognizedPattern | null {
  if (cards.length !== 1) return null;
  const c = cards[0]!;
  return { kind: 'single', primaryWeight: pointValueOf(c, level), cards };
}

/**
 * 同点组识别：用于 pair / triple / bomb。
 * 规则：
 *   - 非百搭部分必须全部同 rank（不允许王与普通牌混拼）。
 *   - 王不可与百搭混合：例如"小王 + 百搭"不构成对。
 *   - 全百搭（仅 2 张时）→ 级牌对子。
 *   - 王对：必须同色（小王×2 或 大王×2）。
 */
function tryUniformGroup(
  cards: Card[],
  level: Rank,
  size: number,
): { weight: number } | null {
  if (cards.length !== size) return null;
  const { wilds, others } = split(cards, level);

  if (wilds.length === size) {
    if (size === 2) return { weight: 15 }; // 双百搭 = 级牌对
    return null; // 三/四张全百搭 — 实战手牌限制下罕见，保守拒绝
  }

  if (others.length === 0) return null;
  const key = allSameRank(others);
  if (key === null) return null;

  // 王不能与百搭混
  if ((key === 'SJ' || key === 'BJ') && wilds.length > 0) return null;

  return { weight: pointFromKey(key, level) };
}

function tryPair(cards: Card[], level: Rank): RecognizedPattern | null {
  const g = tryUniformGroup(cards, level, 2);
  return g ? { kind: 'pair', primaryWeight: g.weight, cards } : null;
}

function tryTriple(cards: Card[], level: Rank): RecognizedPattern | null {
  const g = tryUniformGroup(cards, level, 3);
  return g ? { kind: 'triple', primaryWeight: g.weight, cards } : null;
}

// ---------------------------------------------------------------------------
// 三带二
// ---------------------------------------------------------------------------

function tryTriplePair(cards: Card[], level: Rank): RecognizedPattern | null {
  if (cards.length !== 5) return null;
  const { wilds, others } = split(cards, level);

  // 按非百搭 rank 分组
  const buckets = new Map<RankKey, Card[]>();
  for (const c of others) {
    const k = rankKeyOf(c);
    const arr = buckets.get(k) ?? [];
    arr.push(c);
    buckets.set(k, arr);
  }

  // 枚举三张主点 + 对子点
  const keys = [...buckets.keys()];
  for (const tk of keys) {
    if (tk === 'SJ' || tk === 'BJ') continue; // 王不能做三张主点
    const tCnt = buckets.get(tk)!.length;
    if (tCnt > 3) continue;
    const tNeed = 3 - tCnt;
    if (tNeed < 0 || tNeed > wilds.length) continue;
    const wildsLeft = wilds.length - tNeed;

    for (const pk of keys) {
      if (pk === tk) continue;
      if (pk === 'SJ' || pk === 'BJ') {
        // 王做对子需同色（两只 SJ 或两只 BJ）且不能有百搭混
        if (wildsLeft > 0) continue;
        const arr = buckets.get(pk)!;
        if (arr.length !== 2) continue;
        return { kind: 'triple-pair', primaryWeight: pointFromKey(tk, level), cards };
      }
      const pCnt = buckets.get(pk)!.length;
      if (pCnt > 2) continue;
      const pNeed = 2 - pCnt;
      if (pNeed < 0 || pNeed !== wildsLeft) continue;
      return { kind: 'triple-pair', primaryWeight: pointFromKey(tk, level), cards };
    }

    // 对子由 2 张百搭组成（与三张同点冲突时退化为四张相同 → 炸弹，不在此处理）
    if (wildsLeft === 2 && tCnt === 3) {
      // 三张已经全是真牌，剩 2 张百搭 → 级牌对子（不允许与三张主点重合）
      if (tk !== level) {
        return { kind: 'triple-pair', primaryWeight: pointFromKey(tk, level), cards };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 顺子 / 连对 / 钢板 — 连续段类
// ---------------------------------------------------------------------------

/**
 * 通用连续段识别：
 *   groupSize=1 length=5 → 顺子
 *   groupSize=2 length=3 → 连对（6 张）
 *   groupSize=3 length=2 → 钢板（6 张）
 *
 * 限制：不可含王；最低段起点 1（A 视作 1，仅用于 A2345），最高段终点 14（A）。
 * 段内禁止跨越 A→2（A2345 是唯一例外，由 start=1 处理）。
 */
function tryRun(
  cards: Card[],
  level: Rank,
  groupSize: 1 | 2 | 3,
  length: number,
): { weight: number } | null {
  if (cards.length !== groupSize * length) return null;
  const { wilds, others } = split(cards, level);
  if (others.some((c) => c.kind === 'joker')) return null;

  const cnt = new Map<number, number>();
  for (const c of others as NormalCard[]) {
    const v = naturalRankValue(c.rank);
    cnt.set(v, (cnt.get(v) ?? 0) + 1);
  }
  if ([...cnt.values()].some((n) => n > groupSize)) return null;

  // 起点 start ∈ [1, 14 - length + 1]；start=1 时 A(14) 折算为 1。
  for (let start = 1; start <= 15 - length; start++) {
    let needWilds = 0;
    let valid = true;
    for (let i = 0; i < length; i++) {
      const slot = start + i;
      const lookup = slot === 1 ? 14 : slot; // A=1 槽位查 14
      // 真实段内"2"槽位（slot=2）只能由 rank=2 (value=2) 占据
      const have = cnt.get(lookup) ?? 0;
      if (have > groupSize) { valid = false; break; }
      needWilds += groupSize - have;
    }
    if (!valid) continue;
    if (needWilds !== wilds.length) continue;

    // 防止某真牌 rank 落在段外（例如段是 3-7 而手里有张 9）
    let outOfRange = false;
    for (const [v] of cnt) {
      const inWindow = (v >= start && v < start + length) || (start === 1 && v === 14);
      if (!inWindow) { outOfRange = true; break; }
    }
    if (outOfRange) continue;

    // 主点 = 段顶
    return { weight: start + length - 1 };
  }
  return null;
}

function tryStraight(cards: Card[], level: Rank) {
  const r = tryRun(cards, level, 1, 5);
  return r ? ({ kind: 'straight', primaryWeight: r.weight, cards } as RecognizedPattern) : null;
}
function tryPairChain(cards: Card[], level: Rank) {
  const r = tryRun(cards, level, 2, 3);
  return r ? ({ kind: 'pair-chain', primaryWeight: r.weight, cards } as RecognizedPattern) : null;
}
function tryPlate(cards: Card[], level: Rank) {
  const r = tryRun(cards, level, 3, 2);
  return r ? ({ kind: 'plate', primaryWeight: r.weight, cards } as RecognizedPattern) : null;
}

// ---------------------------------------------------------------------------
// 炸弹 / 同花顺 / 王炸
// ---------------------------------------------------------------------------

function tryRocket(cards: Card[]): RecognizedPattern | null {
  if (cards.length !== 4) return null;
  if (cards.some((c) => c.kind !== 'joker')) return null;
  const small = cards.filter((c) => c.kind === 'joker' && c.color === 'black').length;
  const big = cards.filter((c) => c.kind === 'joker' && c.color === 'red').length;
  if (small === 2 && big === 2) {
    return { kind: 'rocket', primaryWeight: 1000, length: 4, cards };
  }
  return null;
}

function tryBomb(cards: Card[], level: Rank): RecognizedPattern | null {
  if (cards.length < 4) return null;
  const { wilds, others } = split(cards, level);

  // 纯王不算炸（4 王 = 王炸由 tryRocket 处理）
  if (others.length === 0) return null;

  const key = allSameRank(others);
  if (key === null) return null;
  // 王不能与百搭混做炸弹
  if ((key === 'SJ' || key === 'BJ') && wilds.length > 0) return null;
  // 王组成的"炸弹"（4 张同色王）实战不可能（每副只 1 红 1 黑）→ 跳过
  if (key === 'SJ' || key === 'BJ') return null;

  return {
    kind: 'bomb',
    primaryWeight: pointFromKey(key, level),
    length: cards.length,
    cards,
  };
}

function tryStraightFlush(cards: Card[], level: Rank): RecognizedPattern | null {
  if (cards.length !== 5) return null;
  const { wilds, others } = split(cards, level);
  if (others.some((c) => c.kind === 'joker')) return null;

  // 所有真牌必须同花
  const suits = new Set((others as NormalCard[]).map((c) => c.suit));
  if (suits.size !== 1) return null;

  // 复用顺子逻辑判断连续性
  const run = tryRun(cards, level, 1, 5);
  if (!run) return null;
  return { kind: 'straight-flush', primaryWeight: run.weight, length: 5, cards };
}

// ---------------------------------------------------------------------------
// 公共入口
// ---------------------------------------------------------------------------

/**
 * 识别一组牌的合法牌型；不合法返回 null。
 *
 * 识别优先级：先识别 rocket / straight-flush / bomb（更强牌型），
 * 再尝试 plate / pair-chain / triple-pair / straight / triple / pair / single。
 * 同一组牌可能同时是 bomb 与 triple-pair（如 KKKK + 百搭），优先取更强者。
 */
export function recognize(cards: Card[], level: Rank): RecognizedPattern | null {
  if (!cards || cards.length === 0) return null;
  // 校验所有 rank 都在合法集合内
  for (const c of cards) {
    if (c.kind === 'normal' && !RANK_ORDER.includes(c.rank)) return null;
  }

  return (
    tryRocket(cards) ??
    tryStraightFlush(cards, level) ??
    tryBomb(cards, level) ??
    tryPlate(cards, level) ??
    tryPairChain(cards, level) ??
    tryTriplePair(cards, level) ??
    tryStraight(cards, level) ??
    tryTriple(cards, level) ??
    tryPair(cards, level) ??
    trySingle(cards, level)
  );
}
