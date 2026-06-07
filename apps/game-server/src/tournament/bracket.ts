/**
 * Phase 4 Sprint 1 · 单淘汰（Single Elimination）配对算法
 *
 * 设计要点：
 * 1. 纯函数 + 严格类型：输入 entries → 输出 BracketRound[]，无副作用。
 * 2. 标准种子配对：以 1 vs 2N、2 vs 2N-1、3 vs 2N-2、... 的方式分散强种子，
 *    确保 1 号种子最晚遇到 2 号种子。
 * 3. Bye（轮空）处理：当队伍数不是 2 的幂次方时，按"补齐到下一 2 的幂次"原则，
 *    给排名靠前的种子分配 bye。Bye 在 round 1 直接 advance 到 round 2。
 * 4. 完整 bracket 预生成：round 1 ~ round N（N = log2(slot 数）），后续轮次的
 *    matchup 槽位以 `winnerOfMatchId` 占位（待 round 1 出结果后填充）。
 *
 * 注意：本算法**不操作仓储**，调用方负责把生成的 BracketRound[] 持久化为
 * TournamentRound + 未来的 TournamentMatch 记录。
 */

import type { TournamentEntryRecord } from './tournament.repository.js';

/** 配对槽位：一个 entry，或一个 bye（自动晋级），或前序 match 胜者占位。 */
export type BracketSlot =
  | { kind: 'entry'; entryId: string; seed: number; teamName: string }
  | { kind: 'bye' }
  | { kind: 'winner_of'; matchId: string };

export interface BracketMatch {
  /** 形如 `R1M1` / `R2M3`，全 bracket 内唯一。 */
  matchId: string;
  roundIndex: number;
  /** 该轮内的序号（1-based）。 */
  matchIndex: number;
  slotA: BracketSlot;
  slotB: BracketSlot;
  /** 若一侧是 bye，胜者已确定，可直接晋级到下一轮。 */
  preDeterminedWinner: 'A' | 'B' | null;
}

export interface BracketRound {
  roundIndex: number;
  name: string;
  matches: BracketMatch[];
}

export interface Bracket {
  /** 实际参赛队伍数。 */
  entryCount: number;
  /** 补齐到的下一 2 的幂次（slot 总数）。 */
  slotCount: number;
  /** 总轮数 = log2(slotCount)。 */
  totalRounds: number;
  rounds: BracketRound[];
}

const ROUND_NAMES: Record<number, string> = {
  2: 'Final',
  4: 'Semifinal',
  8: 'Quarterfinal',
  16: 'Round of 16',
  32: 'Round of 32',
  64: 'Round of 64',
};

function nextPow2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function roundName(matchesInRound: number): string {
  const teamsInRound = matchesInRound * 2;
  return ROUND_NAMES[teamsInRound] ?? `Round of ${teamsInRound}`;
}

/**
 * 标准 bracket seed 顺序。对于 slotCount=8 返回 [1,8,4,5,2,7,3,6]，
 * 配对方式：[1 vs 8] [4 vs 5] [2 vs 7] [3 vs 6]，
 * 使 1 号种子和 2 号种子在不同半区。
 *
 * 递归构造：order(2) = [1, 2]；order(2N) = interleave(order(N), 2N+1 - order(N))。
 */
export function standardSeedOrder(slotCount: number): number[] {
  if (slotCount < 1 || (slotCount & (slotCount - 1)) !== 0) {
    throw new Error(`slotCount must be a power of 2, got ${slotCount}`);
  }
  let order = [1];
  while (order.length < slotCount) {
    const size = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, size + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * 生成单淘汰 bracket。
 *
 * @param entries 报名条目（非空；已过滤 WITHDRAWN/KICKED 的活跃报名）
 * @returns 全轮次预生成的 bracket。round 1 直接绑定 entries / byes；
 *          后续轮次以 winner_of 占位。
 */
export function generateSingleEliminationBracket(
  entries: readonly TournamentEntryRecord[],
): Bracket {
  if (entries.length < 2) {
    throw new Error(`Need at least 2 entries to build a bracket, got ${entries.length}`);
  }
  const slotCount = nextPow2(entries.length);
  const totalRounds = Math.log2(slotCount);

  // 1. 按 seed 升序排（无 seed 的排到最后；同 seed 按 registeredAt 早 → 优先）。
  const sorted = [...entries].sort((a, b) => {
    const sa = a.seed ?? Number.POSITIVE_INFINITY;
    const sb = b.seed ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return a.registeredAt.localeCompare(b.registeredAt);
  });
  // 重新分配规范种子号 1..N（即使输入 seed 缺失或重复）。
  const ranked = sorted.map((e, i) => ({ entry: e, rank: i + 1 }));

  // 2. 把 ranked + (slotCount - N) 个 bye 按 standardSeedOrder 排进槽位。
  const order = standardSeedOrder(slotCount);
  const slots: BracketSlot[] = order.map((seedPos) => {
    const r = ranked.find((x) => x.rank === seedPos);
    if (r) {
      return {
        kind: 'entry',
        entryId: r.entry.id,
        seed: r.rank,
        teamName: r.entry.teamName,
      };
    }
    return { kind: 'bye' };
  });

  // 3. 构造 round 1 matches。
  const rounds: BracketRound[] = [];
  const round1Matches: BracketMatch[] = [];
  for (let i = 0; i < slotCount; i += 2) {
    const slotA = slots[i]!;
    const slotB = slots[i + 1]!;
    const matchIndex = i / 2 + 1;
    let preDeterminedWinner: 'A' | 'B' | null = null;
    if (slotA.kind === 'bye' && slotB.kind === 'entry') preDeterminedWinner = 'B';
    else if (slotB.kind === 'bye' && slotA.kind === 'entry') preDeterminedWinner = 'A';
    else if (slotA.kind === 'bye' && slotB.kind === 'bye') {
      // 不应该出现：两侧都 bye 意味着 slotCount 选错了。
      throw new Error(
        `Internal error: double-bye at round 1 match ${matchIndex} (slotCount=${slotCount}, entries=${entries.length})`,
      );
    }
    round1Matches.push({
      matchId: `R1M${matchIndex}`,
      roundIndex: 1,
      matchIndex,
      slotA,
      slotB,
      preDeterminedWinner,
    });
  }
  rounds.push({
    roundIndex: 1,
    name: roundName(round1Matches.length),
    matches: round1Matches,
  });

  // 4. 构造后续轮次，每一对前轮 match → 下一轮 1 个 match。
  let prevRound = round1Matches;
  for (let r = 2; r <= totalRounds; r++) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < prevRound.length; i += 2) {
      const left = prevRound[i]!;
      const right = prevRound[i + 1]!;
      const matchIndex = i / 2 + 1;
      matches.push({
        matchId: `R${r}M${matchIndex}`,
        roundIndex: r,
        matchIndex,
        slotA: { kind: 'winner_of', matchId: left.matchId },
        slotB: { kind: 'winner_of', matchId: right.matchId },
        preDeterminedWinner: null,
      });
    }
    rounds.push({
      roundIndex: r,
      name: roundName(matches.length),
      matches,
    });
    prevRound = matches;
  }

  return {
    entryCount: entries.length,
    slotCount,
    totalRounds,
    rounds,
  };
}
