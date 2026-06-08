import { Inject, Injectable } from '@nestjs/common';
import {
  TOURNAMENT_REPOSITORY,
  type EntryStatus,
  type TournamentEntryRecord,
  type TournamentFormat,
  type TournamentRecord,
  type TournamentRepository,
  type TournamentStatus,
} from './tournament.repository.js';
import { generateSingleEliminationBracket, propagateBracket, recordBracketResult, getBracketChampion, findBracketMatch, BracketProgressError, type Bracket, type BracketSlot } from './bracket.js';

/** 业务异常（控制器映射为 4xx）。 */
export class TournamentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

export interface CreateTournamentInput {
  name: string;
  hostUserId: string;
  format?: TournamentFormat;
  maxTeams?: number;
  startLevel?: string;
  description?: string | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
}

export interface RegisterEntryInput {
  captainUserId: string;
  partnerUserId?: string | null;
  teamName: string;
  seed?: number | null;
}

@Injectable()
export class TournamentService {
  /**
   * Phase 4 Sprint 2 · 进行中赛事的 bracket 状态（in-memory，按 tournamentId 索引）。
   *
   * 选择放在 service 内而非 repository，是因为 bracket 是"运行时派生状态"，
   * 当前阶段未引入 TournamentMatch 表；后续 Sprint 落库时可平滑迁移到 repo。
   */
  private readonly liveBrackets = new Map<string, Bracket>();

  constructor(
    @Inject(TOURNAMENT_REPOSITORY) private readonly repo: TournamentRepository,
  ) {}

  // ---------- Tournament lifecycle ----------

  createTournament(input: CreateTournamentInput): TournamentRecord {
    if (!input.name || input.name.trim() === '') {
      throw new TournamentError('BAD_REQUEST', 'name is required');
    }
    if (!input.hostUserId || input.hostUserId.trim() === '') {
      throw new TournamentError('BAD_REQUEST', 'hostUserId is required');
    }
    const maxTeams = input.maxTeams ?? 16;
    if (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 256) {
      throw new TournamentError('BAD_REQUEST', 'maxTeams must be integer in [2, 256]');
    }
    return this.repo.createTournament({
      name: input.name.trim(),
      hostUserId: input.hostUserId,
      format: input.format ?? 'SINGLE_ELIM',
      status: 'DRAFT',
      maxTeams,
      startLevel: input.startLevel ?? '2',
      registrationOpensAt: input.registrationOpensAt ?? null,
      registrationClosesAt: input.registrationClosesAt ?? null,
      startedAt: null,
      finishedAt: null,
      description: input.description ?? null,
    });
  }

  getTournament(id: string): TournamentRecord {
    const t = this.repo.getTournament(id);
    if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', id, 404);
    return t;
  }

  listTournaments(filter?: { status?: TournamentStatus; hostUserId?: string }): TournamentRecord[] {
    return this.repo.listTournaments(filter);
  }

  openRegistration(id: string): TournamentRecord {
    const t = this.getTournament(id);
    if (t.status !== 'DRAFT') {
      throw new TournamentError(
        'INVALID_STATE',
        `Cannot open registration from status ${t.status}`,
      );
    }
    return this.repo.updateTournamentStatus(id, 'OPEN')!;
  }

  closeRegistration(id: string): TournamentRecord {
    const t = this.getTournament(id);
    if (t.status !== 'OPEN') {
      throw new TournamentError(
        'INVALID_STATE',
        `Cannot close registration from status ${t.status}`,
      );
    }
    return this.repo.updateTournamentStatus(id, 'DRAFT')!;
  }

  startTournament(id: string): { tournament: TournamentRecord; bracket: Bracket } {
    const t = this.getTournament(id);
    if (t.status !== 'OPEN' && t.status !== 'DRAFT') {
      throw new TournamentError('INVALID_STATE', `Cannot start from status ${t.status}`);
    }
    const activeEntries = this.repo
      .listEntries(id)
      .filter((e) => e.status === 'CONFIRMED' || e.status === 'PENDING');
    if (activeEntries.length < 2) {
      throw new TournamentError(
        'NOT_ENOUGH_ENTRIES',
        `Need at least 2 active entries to start, got ${activeEntries.length}`,
      );
    }
    const bracket = generateSingleEliminationBracket(activeEntries);
    // 把生成的所有轮次落 TournamentRound（先建空 round 框架，后续 Sprint 再补 TournamentMatch 关联表）。
    for (const r of bracket.rounds) {
      this.repo.addRound({ tournamentId: id, roundIndex: r.roundIndex, name: r.name });
    }
    // Sprint 2：把首轮 bye 链向后传播一次，然后把 bracket 缓存为运行时状态。
    const propagated = propagateBracket(bracket);
    this.liveBrackets.set(id, propagated);
    const updated = this.repo.updateTournamentStatus(id, 'RUNNING')!;
    return { tournament: updated, bracket: propagated };
  }

  finishTournament(id: string): TournamentRecord {
    const t = this.getTournament(id);
    if (t.status !== 'RUNNING') {
      throw new TournamentError('INVALID_STATE', `Cannot finish from status ${t.status}`);
    }
    return this.repo.updateTournamentStatus(id, 'FINISHED')!;
  }

  cancelTournament(id: string): TournamentRecord {
    const t = this.getTournament(id);
    if (t.status === 'FINISHED' || t.status === 'CANCELLED') {
      throw new TournamentError('INVALID_STATE', `Cannot cancel from terminal status ${t.status}`);
    }
    return this.repo.updateTournamentStatus(id, 'CANCELLED')!;
  }

  // ---------- Entry operations ----------

  registerEntry(tournamentId: string, input: RegisterEntryInput): TournamentEntryRecord {
    const t = this.getTournament(tournamentId);
    if (t.status !== 'OPEN') {
      throw new TournamentError(
        'REGISTRATION_CLOSED',
        `Tournament status ${t.status} does not accept registrations`,
      );
    }
    if (!input.captainUserId || !input.teamName || input.teamName.trim() === '') {
      throw new TournamentError('BAD_REQUEST', 'captainUserId and teamName are required');
    }
    if (input.partnerUserId && input.partnerUserId === input.captainUserId) {
      throw new TournamentError('BAD_REQUEST', 'partnerUserId must differ from captainUserId');
    }
    try {
      return this.repo.registerEntry({
        tournamentId,
        captainUserId: input.captainUserId,
        partnerUserId: input.partnerUserId ?? null,
        teamName: input.teamName.trim(),
        seed: input.seed ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already registered/i.test(msg)) {
        throw new TournamentError('DUPLICATE_CAPTAIN', msg, 409);
      }
      if (/full/i.test(msg)) {
        throw new TournamentError('TOURNAMENT_FULL', msg, 409);
      }
      throw err;
    }
  }

  updateEntryStatus(entryId: string, status: EntryStatus): TournamentEntryRecord {
    const e = this.repo.updateEntryStatus(entryId, status);
    if (!e) throw new TournamentError('ENTRY_NOT_FOUND', entryId, 404);
    return e;
  }

  listEntries(
    tournamentId: string,
    filter?: { status?: EntryStatus },
  ): TournamentEntryRecord[] {
    // 校验赛事存在
    this.getTournament(tournamentId);
    return this.repo.listEntries(tournamentId, filter);
  }

  /** 任意时刻基于当前活跃 entries 生成 bracket 预览（只读，不持久化）。 */
  previewBracket(tournamentId: string): Bracket {
    this.getTournament(tournamentId);
    const active = this.repo
      .listEntries(tournamentId)
      .filter((e) => e.status === 'CONFIRMED' || e.status === 'PENDING');
    if (active.length < 2) {
      throw new TournamentError(
        'NOT_ENOUGH_ENTRIES',
        `Need at least 2 active entries for bracket, got ${active.length}`,
      );
    }
    return generateSingleEliminationBracket(active);
  }

  // ---------- Phase 4 Sprint 2 · Bracket 推进 ----------

  /** 当前进行中的 bracket（startTournament 之后可用）。 */
  getLiveBracket(tournamentId: string): Bracket {
    this.getTournament(tournamentId);
    const b = this.liveBrackets.get(tournamentId);
    if (!b) {
      throw new TournamentError(
        'BRACKET_NOT_STARTED',
        `Bracket for ${tournamentId} not started`,
        404,
      );
    }
    return b;
  }

  /**
   * 记录一场 bracket match 的结果。胜方自动晋级到下一轮 `winner_of` 槽位；
   * 若是最终一轮，会自动把赛事状态推进到 `FINISHED` 并返回 champion。
   */
  recordBracketMatchResult(
    tournamentId: string,
    matchId: string,
    winner: 'A' | 'B',
  ): { bracket: Bracket; champion: BracketSlot | null; tournament: TournamentRecord } {
    const t = this.getTournament(tournamentId);
    if (t.status !== 'RUNNING') {
      throw new TournamentError(
        'INVALID_STATE',
        `Cannot record bracket result when status=${t.status}`,
      );
    }
    const current = this.liveBrackets.get(tournamentId);
    if (!current) {
      throw new TournamentError(
        'BRACKET_NOT_STARTED',
        `Bracket for ${tournamentId} not started`,
        404,
      );
    }
    let next: Bracket;
    try {
      next = recordBracketResult(current, matchId, winner);
    } catch (err) {
      if (err instanceof BracketProgressError) {
        const statusByCode: Record<string, number> = {
          MATCH_NOT_FOUND: 404,
          MATCH_ALREADY_DECIDED: 409,
          SLOT_NOT_DETERMINED: 409,
          INVALID_WINNER: 400,
        };
        throw new TournamentError(err.code, err.message, statusByCode[err.code] ?? 400);
      }
      throw err;
    }
    this.liveBrackets.set(tournamentId, next);
    const champion = getBracketChampion(next);
    let tournament = t;
    if (champion) {
      tournament = this.repo.updateTournamentStatus(tournamentId, 'FINISHED') ?? t;
    }
    return { bracket: next, champion, tournament };
  }

  /** 单独取一场 bracket match 状态（测试 / 前端展示用）。 */
  getBracketMatch(tournamentId: string, matchId: string) {
    const b = this.getLiveBracket(tournamentId);
    const m = findBracketMatch(b, matchId);
    if (!m) {
      throw new TournamentError('MATCH_NOT_FOUND', `bracket match ${matchId} not found`, 404);
    }
    return m;
  }
}
