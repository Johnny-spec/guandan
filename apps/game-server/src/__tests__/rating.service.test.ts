import { describe, expect, it } from 'vitest';
import { RatingService, type RatingInput } from '../match/rating.service.js';

describe('RatingService (team ELO)', () => {
  const svc = new RatingService();
  const four = (rNs: number, rEw: number): RatingInput[] => [
    { userId: 'n', rating: rNs, team: 'NS', isBot: false },
    { userId: 's', rating: rNs, team: 'NS', isBot: false },
    { userId: 'e', rating: rEw, team: 'EW', isBot: false },
    { userId: 'w', rating: rEw, team: 'EW', isBot: false },
  ];

  it('零和：两队 delta 之和为 0（按队员对计算）', () => {
    const out = svc.compute(four(1000, 1000), 'NS');
    const sumNs = out.filter((o) => ['n', 's'].includes(o.userId)).reduce((s, o) => s + o.ratingDelta, 0);
    const sumEw = out.filter((o) => ['e', 'w'].includes(o.userId)).reduce((s, o) => s + o.ratingDelta, 0);
    expect(sumNs + sumEw).toBe(0);
  });

  it('同分平势：赢方 +K/2=+12，输方 -12', () => {
    const out = svc.compute(four(1000, 1000), 'NS');
    expect(out.find((o) => o.userId === 'n')?.ratingDelta).toBe(12);
    expect(out.find((o) => o.userId === 'e')?.ratingDelta).toBe(-12);
  });

  it('强队赢弱队：拿分少', () => {
    const out = svc.compute(four(1400, 1000), 'NS');
    const ns = out.find((o) => o.userId === 'n')!;
    expect(ns.ratingDelta).toBeGreaterThan(0);
    expect(ns.ratingDelta).toBeLessThan(12);
  });

  it('强队输弱队：失分多', () => {
    const out = svc.compute(four(1400, 1000), 'EW');
    const ns = out.find((o) => o.userId === 'n')!;
    expect(ns.ratingDelta).toBeLessThan(-12);
  });

  it('bot 不写分：delta=0，rating 不变', () => {
    const inputs: RatingInput[] = [
      { userId: 'n', rating: 1000, team: 'NS', isBot: false },
      { userId: 's', rating: 1000, team: 'NS', isBot: true },
      { userId: 'e', rating: 1000, team: 'EW', isBot: true },
      { userId: 'w', rating: 1000, team: 'EW', isBot: true },
    ];
    const out = svc.compute(inputs, 'NS');
    expect(out.find((o) => o.userId === 's')?.ratingDelta).toBe(0);
    expect(out.find((o) => o.userId === 's')?.ratingAfter).toBe(1000);
    expect(out.find((o) => o.userId === 'n')?.ratingDelta).toBe(12);
  });

  it('参数错误：人数不是 4 抛错', () => {
    expect(() => svc.compute([], 'NS')).toThrow();
  });

  it('参数错误：阵营不是 2v2 抛错', () => {
    const bad: RatingInput[] = [
      { userId: 'n', rating: 1000, team: 'NS', isBot: false },
      { userId: 'e', rating: 1000, team: 'EW', isBot: false },
      { userId: 'w', rating: 1000, team: 'EW', isBot: false },
      { userId: 's', rating: 1000, team: 'EW', isBot: false },
    ];
    expect(() => svc.compute(bad, 'NS')).toThrow();
  });
});
