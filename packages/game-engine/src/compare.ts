import type { RecognizedPattern } from './patterns.js';

/**
 * 炸弹层级（含同花顺、王炸）：
 *   4-bomb=4, 5-bomb=5, 6-bomb=6, straight-flush=6.5,
 *   7-bomb=7, ..., n-bomb=n, rocket=100
 * 同层比 primaryWeight；不同层高者胜。
 */
export function bombTier(p: RecognizedPattern): number | null {
  if (p.kind === 'rocket') return 100;
  if (p.kind === 'straight-flush') return 6.5;
  if (p.kind === 'bomb') return p.length ?? p.cards.length;
  return null;
}

/**
 * 比较 challenger 是否能压过 current。
 *   > 0  : challenger 大
 *   = 0  : 不能比较（牌型/长度不同且都不是炸类）
 *   < 0  : challenger 不够大
 */
export function compare(current: RecognizedPattern, challenger: RecognizedPattern): number {
  const ct = bombTier(current);
  const ht = bombTier(challenger);

  // 双方都是炸类 → 先比层级，再比主点
  if (ct !== null && ht !== null) {
    if (ht !== ct) return ht - ct;
    return challenger.primaryWeight - current.primaryWeight;
  }

  // 仅 challenger 是炸类 → 自动压制
  if (ht !== null) return 1;

  // 仅 current 是炸类 → challenger 必败
  if (ct !== null) return -1;

  // 非炸类：牌型与长度必须一致
  if (current.kind !== challenger.kind) return 0;
  if ((current.length ?? current.cards.length) !== (challenger.length ?? challenger.cards.length)) {
    return 0;
  }
  return challenger.primaryWeight - current.primaryWeight;
}
