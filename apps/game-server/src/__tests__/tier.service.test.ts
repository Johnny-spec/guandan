import { describe, expect, it } from 'vitest';
import { TIER_BANDS, TierService } from '../match/tier.service.js';

describe('TierService', () => {
  const svc = new TierService();

  it('低于最低边界 → bronze', () => {
    expect(svc.bandOf(0).key).toBe('bronze');
    expect(svc.bandOf(-50).key).toBe('bronze');
    expect(svc.bandOf(899).key).toBe('bronze');
  });

  it('边界点归属下一段（半开区间）', () => {
    expect(svc.bandOf(900).key).toBe('silver');
    expect(svc.bandOf(1000).key).toBe('gold');
    expect(svc.bandOf(1100).key).toBe('platinum');
    expect(svc.bandOf(1200).key).toBe('diamond');
    expect(svc.bandOf(1350).key).toBe('master');
    expect(svc.bandOf(1500).key).toBe('grandmaster');
  });

  it('顶段无上限', () => {
    expect(svc.bandOf(9999).key).toBe('grandmaster');
  });

  it('NaN / Infinity 兜底到 bronze（非有限数视为无效输入归零）', () => {
    expect(svc.bandOf(Number.NaN).key).toBe('bronze');
    expect(svc.bandOf(Number.POSITIVE_INFINITY).key).toBe('bronze');
  });

  it('resolve: 段中点 progress=0.5，距下一段 = 半段宽', () => {
    const t = svc.resolve(950); // silver [900,1000)
    expect(t.key).toBe('silver');
    expect(t.progress).toBeCloseTo(0.5, 5);
    expect(t.ratingToNext).toBe(50);
    expect(t.nextTier).toBe('gold');
  });

  it('resolve: 顶段 progress=1，ratingToNext/nextTier=null', () => {
    const t = svc.resolve(1800);
    expect(t.key).toBe('grandmaster');
    expect(t.nextTier).toBeNull();
    expect(t.ratingToNext).toBeNull();
    expect(t.progress).toBe(1);
  });

  it('档位连续无空档：每段 max 等于下段 min', () => {
    for (let i = 0; i < TIER_BANDS.length - 1; i += 1) {
      const cur = TIER_BANDS[i]!;
      const nxt = TIER_BANDS[i + 1]!;
      expect(cur.maxRating).not.toBeNull();
      expect(cur.maxRating).toBe(nxt.minRating);
    }
  });

  it('color/label 字段非空', () => {
    for (const b of TIER_BANDS) {
      expect(b.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });
});
