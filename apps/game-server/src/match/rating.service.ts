import { Injectable } from '@nestjs/common';

/**
 * 团队 ELO：把两队（NS / EW）当作两个"玩家"，
 * 用平均评分计算预期胜率，再把单次结果（赢=1 / 输=0）摊给每个队员。
 *
 * 简化假设：4 人都参与同一局；K 固定 24（休闲）/ 32（排位）。
 * Phase 3 可换 Glicko-2 + 段位补偿。
 */
export interface RatingInput {
  userId: string;
  rating: number;
  team: 'NS' | 'EW';
  /** bot 不参与评分回写（rating 视为锚点）。 */
  isBot: boolean;
}

export interface RatingOutcome {
  userId: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
}

const DEFAULT_K = 24;

@Injectable()
export class RatingService {
  compute(
    players: RatingInput[],
    winnerTeam: 'NS' | 'EW',
    k: number = DEFAULT_K,
  ): RatingOutcome[] {
    if (players.length !== 4) throw new Error('rating requires exactly 4 players');
    const ns = players.filter((p) => p.team === 'NS');
    const ew = players.filter((p) => p.team === 'EW');
    if (ns.length !== 2 || ew.length !== 2) throw new Error('teams must be 2v2');

    const avg = (xs: RatingInput[]) => xs.reduce((s, p) => s + p.rating, 0) / xs.length;
    const rNs = avg(ns);
    const rEw = avg(ew);
    const expectedNs = 1 / (1 + Math.pow(10, (rEw - rNs) / 400));
    const expectedEw = 1 - expectedNs;
    const actualNs = winnerTeam === 'NS' ? 1 : 0;
    const actualEw = 1 - actualNs;
    const deltaNs = Math.round(k * (actualNs - expectedNs));
    const deltaEw = Math.round(k * (actualEw - expectedEw));

    return players.map((p) => {
      const delta = p.team === 'NS' ? deltaNs : deltaEw;
      const effectiveDelta = p.isBot ? 0 : delta;
      return {
        userId: p.userId,
        ratingBefore: p.rating,
        ratingAfter: p.rating + effectiveDelta,
        ratingDelta: effectiveDelta,
      };
    });
  }
}
