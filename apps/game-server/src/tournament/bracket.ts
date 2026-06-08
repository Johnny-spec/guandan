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
  /**
   * 当前 match 的胜者。
   * - 生成 bracket 时：若 `preDeterminedWinner` 非空（bye 自动晋级），`winner` 同步初始化；否则为 `null`。
   * - `recordBracketResult` 写入后该字段被 stamp，且下一轮对应的 `winner_of` 槽位会被替换为 entry slot。
   */
  winner: 'A' | 'B' | null;
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
      winner: preDeterminedWinner,
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
        winner: null,
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

// ---- Phase 4 Sprint 2 · Bracket 推进 API ----

/** Bracket 推进语义化错误（区别于 generator 校验错误）。 */
export class BracketProgressError extends Error {
  constructor(
    readonly code:
      | 'MATCH_NOT_FOUND'
      | 'MATCH_ALREADY_DECIDED'
      | 'SLOT_NOT_DETERMINED'
      | 'INVALID_WINNER',
    message: string,
  ) {
    super(message);
    this.name = 'BracketProgressError';
  }
}

function cloneBracket(b: Bracket): Bracket {
  return {
    entryCount: b.entryCount,
    slotCount: b.slotCount,
    totalRounds: b.totalRounds,
    rounds: b.rounds.map((r) => ({
      roundIndex: r.roundIndex,
      name: r.name,
      matches: r.matches.map((m) => ({
        matchId: m.matchId,
        roundIndex: m.roundIndex,
        matchIndex: m.matchIndex,
        slotA: { ...m.slotA } as BracketSlot,
        slotB: { ...m.slotB } as BracketSlot,
        preDeterminedWinner: m.preDeterminedWinner,
        winner: m.winner,
      })),
    })),
  };
}

export function findBracketMatch(b: Bracket, matchId: string): BracketMatch | null {
  for (const r of b.rounds) {
    for (const m of r.matches) if (m.matchId === matchId) return m;
  }
  return null;
}

/**
 * 给定一个 match 已确定的 winner（`'A'|'B'`），返回该侧的 BracketSlot（必为 entry 槽）。
 * 若该侧槽位尚未解析（仍 `winner_of`），返回 null。
 */
function winnerSlotOf(match: BracketMatch): BracketSlot | null {
  const side = match.winner;
  if (side === null) return null;
  const slot = side === 'A' ? match.slotA : match.slotB;
  return slot.kind === 'entry' ? slot : null;
}

/**
 * 把已经决出胜者的 match 向下游传播：在下一轮中找到 `winner_of: matchId` 槽位，替换为该 match 的胜方 entry slot。
 *
 * - 幂等：重复调用结果一致。
 * - 链式传播：bye 自带 winner，调用本函数会一次性把所有可推进的 bye 链向下展开。
 */
export function propagateBracket(b: Bracket): Bracket {
  const next = cloneBracket(b);
  let changed = true;
  while (changed) {
    changed = false;
    for (const round of next.rounds) {
      for (const m of round.matches) {
        const winSlot = winnerSlotOf(m);
        if (!winSlot) continue;
        // 在所有后续 match 中找指向本 match 的 winner_of 槽位并替换。
        for (const r2 of next.rounds) {
          for (const m2 of r2.matches) {
            for (const key of ['slotA', 'slotB'] as const) {
              const s = m2[key];
              if (s.kind === 'winner_of' && s.matchId === m.matchId) {
                m2[key] = { ...winSlot };
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  return next;
}

/**
 * 记录一场 bracket match 的结果。
 *
 * - 校验：matchId 存在；尚未 decided；winner ∈ {'A','B'}；该侧槽位已解析为 entry。
 * - 写入 winner 后立即 `propagateBracket`，把胜方塞进下一轮的 `winner_of` 占位槽。
 * - 纯函数：不修改入参，返回新 Bracket。
 */
export function recordBracketResult(
  bracket: Bracket,
  matchId: string,
  winner: 'A' | 'B',
): Bracket {
  if (winner !== 'A' && winner !== 'B') {
    throw new BracketProgressError('INVALID_WINNER', `winner must be 'A' or 'B', got ${winner}`);
  }
  const target = findBracketMatch(bracket, matchId);
  if (!target) {
    throw new BracketProgressError('MATCH_NOT_FOUND', `Bracket match ${matchId} not found`);
  }
  if (target.winner !== null) {
    throw new BracketProgressError(
      'MATCH_ALREADY_DECIDED',
      `Bracket match ${matchId} already has winner '${target.winner}'`,
    );
  }
  const slot = winner === 'A' ? target.slotA : target.slotB;
  if (slot.kind !== 'entry') {
    throw new BracketProgressError(
      'SLOT_NOT_DETERMINED',
      `Bracket match ${matchId} slot ${winner} not yet resolved (kind=${slot.kind})`,
    );
  }
  const next = cloneBracket(bracket);
  const m = findBracketMatch(next, matchId)!;
  m.winner = winner;
  return propagateBracket(next);
}

/** 若最终一轮唯一 match 的胜者已定，返回 champion entry slot；否则 null。 */
export function getBracketChampion(bracket: Bracket): BracketSlot | null {
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  if (!finalRound || finalRound.matches.length !== 1) return null;
  const final = finalRound.matches[0]!;
  return winnerSlotOf(final);
}
