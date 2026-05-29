import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Seat } from '@teams-guandan/shared-types';
import {
  MATCH_REPOSITORY,
  type MatchKind,
  type MatchPlayerRecord,
  type MatchRecord,
  type MatchRepository,
  type Team,
  type LeaderboardEntry,
  type UserRecord,
} from './match.repository.js';
import { RatingService } from './rating.service.js';

export interface MatchSeat {
  userId: string;
  displayName: string;
  seat: Seat;
  isBot: boolean;
  botDifficulty?: 'easy' | 'normal' | 'hard';
}

function teamOf(seat: Seat): Team {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

interface PendingMatch {
  matchId: string;
  startedAtMs: number;
  startLevel: string;
  seats: MatchSeat[];
}

/**
 * 把网关里"对局开始 / 结束"事件翻译成仓储写入 + 评分变化。
 * 与 GameGateway 解耦：Gateway 只调用 onStart / onFinish。
 */
@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);
  /** roomId → 当前对局占位（每局开始时建一条，结束时落库）。 */
  private readonly pending = new Map<string, PendingMatch>();

  constructor(
    @Inject(MATCH_REPOSITORY) private readonly repo: MatchRepository,
    @Inject(RatingService) private readonly rating: RatingService,
  ) {}

  onStart(roomId: string, level: string, seats: MatchSeat[]): MatchRecord | null {
    if (seats.length !== 4) {
      this.logger.warn(`[onStart] skipped ${roomId}: ${seats.length}/4 seats`);
      return null;
    }
    // 先把所有玩家入库（含 bot）
    for (const s of seats) {
      this.repo.upsertUser({ id: s.userId, displayName: s.displayName, isBot: s.isBot });
    }
    const hasAi = seats.some((s) => s.isBot);
    const kind: MatchKind = hasAi ? 'AI_TRAINING' : 'CASUAL';
    const players: MatchPlayerRecord[] = seats.map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      seat: s.seat,
      team: teamOf(s.seat),
      isBot: s.isBot,
      ...(s.botDifficulty ? { botDifficulty: s.botDifficulty } : {}),
    }));
    const rec = this.repo.createMatch({
      roomId,
      kind,
      result: 'PENDING',
      winnerTeam: null,
      startLevel: level,
      endLevel: null,
      hasAiPlayers: hasAi,
      durationMs: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      players,
    });
    this.pending.set(roomId, {
      matchId: rec.id,
      startedAtMs: Date.now(),
      startLevel: level,
      seats,
    });
    this.logger.log(`[match] start id=${rec.id} room=${roomId} kind=${kind}`);
    return rec;
  }

  onFinish(
    roomId: string,
    winnerTeam: Team,
    finishedOrder: Seat[],
    endLevel: string,
  ): MatchRecord | null {
    const pending = this.pending.get(roomId);
    if (!pending) {
      this.logger.warn(`[onFinish] no pending match for room=${roomId}`);
      return null;
    }
    this.pending.delete(roomId);

    // 计算评分
    const inputs = pending.seats.map((s) => {
      const u = this.repo.getUser(s.userId);
      return {
        userId: s.userId,
        rating: u?.rating ?? 1000,
        team: teamOf(s.seat),
        isBot: s.isBot,
      };
    });
    const outcomes = this.rating.compute(inputs, winnerTeam);
    const outcomeByUser = new Map(outcomes.map((o) => [o.userId, o]));

    // 回写 user rating + 累计统计
    for (const s of pending.seats) {
      const out = outcomeByUser.get(s.userId);
      if (!out) continue;
      const won = teamOf(s.seat) === winnerTeam;
      if (!s.isBot) {
        this.repo.setUserRating(s.userId, out.ratingAfter);
      }
      this.repo.incUserStats(s.userId, won);
    }

    // finishOrder：先把传入的优先编号；其余维持 undefined
    const finishOrderMap = new Map<Seat, number>();
    finishedOrder.forEach((s, i) => finishOrderMap.set(s, i + 1));

    const players: MatchPlayerRecord[] = pending.seats.map((s) => {
      const out = outcomeByUser.get(s.userId)!;
      const rec: MatchPlayerRecord = {
        userId: s.userId,
        displayName: s.displayName,
        seat: s.seat,
        team: teamOf(s.seat),
        isBot: s.isBot,
        ratingBefore: out.ratingBefore,
        ratingAfter: out.ratingAfter,
        ratingDelta: out.ratingDelta,
      };
      if (s.botDifficulty) rec.botDifficulty = s.botDifficulty;
      const fo = finishOrderMap.get(s.seat);
      if (fo !== undefined) rec.finishOrder = fo;
      return rec;
    });

    const updated = this.repo.finishMatch(pending.matchId, {
      result: 'COMPLETED',
      winnerTeam,
      endLevel,
      durationMs: Date.now() - pending.startedAtMs,
      finishedAt: new Date().toISOString(),
      players,
    });
    this.logger.log(
      `[match] finish id=${pending.matchId} winner=${winnerTeam} duration=${updated?.durationMs}ms`,
    );
    return updated;
  }

  onAbort(roomId: string): void {
    const pending = this.pending.get(roomId);
    if (!pending) return;
    this.pending.delete(roomId);
    this.repo.finishMatch(pending.matchId, {
      result: 'ABORTED',
      winnerTeam: null,
      endLevel: pending.startLevel,
      durationMs: Date.now() - pending.startedAtMs,
      finishedAt: new Date().toISOString(),
      players: this.repo.getMatch(pending.matchId)?.players ?? [],
    });
  }

  // ---- 查询 API（控制器直接调用） ----
  upsertHuman(userId: string, displayName: string): void {
    this.repo.upsertUser({ id: userId, displayName, isBot: false });
  }
  getUser(id: string): UserRecord | null {
    return this.repo.getUser(id);
  }
  listMatchesByUser(userId: string, limit: number): MatchRecord[] {
    return this.repo.listMatchesByUser(userId, Math.min(Math.max(limit, 1), 100));
  }
  listLeaderboard(limit: number): LeaderboardEntry[] {
    return this.repo.listLeaderboard(Math.min(Math.max(limit, 1), 100));
  }
}
