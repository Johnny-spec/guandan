import { Injectable } from '@nestjs/common';

export type TierKey =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster';

export interface TierBand {
  key: TierKey;
  label: string;
  /** 最低评分（含）。 */
  minRating: number;
  /** 最高评分（不含）；null = 不封顶。 */
  maxRating: number | null;
  /** UI 着色用，Fluent tokens 友好的 hex。 */
  color: string;
}

export interface TierInfo {
  key: TierKey;
  label: string;
  color: string;
  /** 当前评分。 */
  rating: number;
  /** 距离下一段所需积分；已是最高段则为 null。 */
  nextTier: TierKey | null;
  ratingToNext: number | null;
  /** [0, 1]，当前段进度；最高段恒为 1。 */
  progress: number;
}

/**
 * 段位档位（与未来 Prisma `tiers` 表的 seed 一致）。从低到高，连续无空档。
 * 段位边界经过验证：bronze 起点 0，grandmaster 无上限，区间相邻接续。
 */
export const TIER_BANDS: readonly TierBand[] = [
  { key: 'bronze', label: '青铜', minRating: 0, maxRating: 900, color: '#8C6A4A' },
  { key: 'silver', label: '白银', minRating: 900, maxRating: 1000, color: '#9AA0A6' },
  { key: 'gold', label: '黄金', minRating: 1000, maxRating: 1100, color: '#D4A017' },
  { key: 'platinum', label: '铂金', minRating: 1100, maxRating: 1200, color: '#5BB7C7' },
  { key: 'diamond', label: '钻石', minRating: 1200, maxRating: 1350, color: '#3E8EDE' },
  { key: 'master', label: '大师', minRating: 1350, maxRating: 1500, color: '#7A4DD1' },
  { key: 'grandmaster', label: '宗师', minRating: 1500, maxRating: null, color: '#C2185B' },
] as const;

/**
 * 纯函数 + Injectable：评分到段位的映射。
 * 设计为 stateless，可被 MatchService / Controller / 未来 PrismaTierRepository 复用。
 */
@Injectable()
export class TierService {
  readonly bands: readonly TierBand[] = TIER_BANDS;

  /** 给定评分定位段位档；评分被裁剪到 [0, +∞)。 */
  bandOf(rating: number): TierBand {
    const r = Number.isFinite(rating) ? Math.max(0, rating) : 0;
    for (const b of this.bands) {
      if (r >= b.minRating && (b.maxRating === null || r < b.maxRating)) {
        return b;
      }
    }
    // 不可达，但兜底返回最高档
    return this.bands[this.bands.length - 1]!;
  }

  /** 给定评分返回完整段位信息（含距下一段进度）。 */
  resolve(rating: number): TierInfo {
    const band = this.bandOf(rating);
    const idx = this.bands.indexOf(band);
    const next = idx >= 0 && idx < this.bands.length - 1 ? this.bands[idx + 1]! : null;

    const r = Math.max(0, Number.isFinite(rating) ? rating : 0);
    let progress = 1;
    let ratingToNext: number | null = null;
    if (next && band.maxRating !== null) {
      const span = band.maxRating - band.minRating;
      progress = span > 0 ? Math.min(1, Math.max(0, (r - band.minRating) / span)) : 1;
      ratingToNext = Math.max(0, band.maxRating - r);
    }
    return {
      key: band.key,
      label: band.label,
      color: band.color,
      rating: r,
      nextTier: next ? next.key : null,
      ratingToNext,
      progress,
    };
  }
}
