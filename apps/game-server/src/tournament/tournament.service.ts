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
import { generateSingleEliminationBracket, type Bracket } from './bracket.js';

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
    const updated = this.repo.updateTournamentStatus(id, 'RUNNING')!;
    return { tournament: updated, bracket };
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
}
