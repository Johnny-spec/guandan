import { Injectable } from '@nestjs/common';

export type TournamentFormat =
  | 'SINGLE_ELIM'
  | 'DOUBLE_ELIM'
  | 'SWISS'
  | 'ROUND_ROBIN';

export type TournamentStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'RUNNING'
  | 'FINISHED'
  | 'CANCELLED';

export type EntryStatus = 'PENDING' | 'CONFIRMED' | 'WITHDRAWN' | 'KICKED';

export interface TournamentRecord {
  id: string;
  name: string;
  hostUserId: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxTeams: number;
  startLevel: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentEntryRecord {
  id: string;
  tournamentId: string;
  captainUserId: string;
  partnerUserId: string | null;
  teamName: string;
  seed: number | null;
  status: EntryStatus;
  registeredAt: string;
  withdrawnAt: string | null;
}

export interface TournamentRoundRecord {
  id: string;
  tournamentId: string;
  roundIndex: number;
  name: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Phase 4 Sprint 1：赛事仓储接口。InMemory 实现先行，
 * 后续 Sprint 加 PrismaTournamentRepository（与 MatchRepository 同样的演进路径）。
 */
export interface TournamentRepository {
  createTournament(
    t: Omit<TournamentRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): TournamentRecord;
  getTournament(id: string): TournamentRecord | null;
  listTournaments(filter?: { status?: TournamentStatus; hostUserId?: string }): TournamentRecord[];
  updateTournamentStatus(id: string, status: TournamentStatus): TournamentRecord | null;
  /** 报名（队长唯一性约束：同一赛事一个队长只能报一次活跃报名）。失败抛错。 */
  registerEntry(
    e: Omit<TournamentEntryRecord, 'id' | 'registeredAt' | 'status' | 'withdrawnAt'> & {
      id?: string;
      status?: EntryStatus;
    },
  ): TournamentEntryRecord;
  updateEntryStatus(id: string, status: EntryStatus): TournamentEntryRecord | null;
  listEntries(tournamentId: string, filter?: { status?: EntryStatus }): TournamentEntryRecord[];
  addRound(
    r: Omit<TournamentRoundRecord, 'id' | 'startedAt' | 'finishedAt'> & {
      id?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): TournamentRoundRecord;
  listRounds(tournamentId: string): TournamentRoundRecord[];
  /** 测试专用：清空全部状态。 */
  reset(): void;
}

export const TOURNAMENT_REPOSITORY = Symbol('TOURNAMENT_REPOSITORY');

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Injectable()
export class InMemoryTournamentRepository implements TournamentRepository {
  private tournaments = new Map<string, TournamentRecord>();
  private entries = new Map<string, TournamentEntryRecord[]>();
  private entryIndex = new Map<string, string>();
  private rounds = new Map<string, TournamentRoundRecord[]>();

  createTournament(
    t: Omit<TournamentRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): TournamentRecord {
    const now = new Date().toISOString();
    const rec: TournamentRecord = {
      id: t.id ?? makeId(),
      name: t.name,
      hostUserId: t.hostUserId,
      format: t.format,
      status: t.status,
      maxTeams: t.maxTeams,
      startLevel: t.startLevel,
      registrationOpensAt: t.registrationOpensAt,
      registrationClosesAt: t.registrationClosesAt,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      description: t.description,
      createdAt: now,
      updatedAt: now,
    };
    this.tournaments.set(rec.id, rec);
    this.entries.set(rec.id, []);
    this.rounds.set(rec.id, []);
    return rec;
  }

  getTournament(id: string): TournamentRecord | null {
    return this.tournaments.get(id) ?? null;
  }

  listTournaments(filter?: { status?: TournamentStatus; hostUserId?: string }): TournamentRecord[] {
    const all = Array.from(this.tournaments.values());
    const filtered = all.filter((t) => {
      if (filter?.status && t.status !== filter.status) return false;
      if (filter?.hostUserId && t.hostUserId !== filter.hostUserId) return false;
      return true;
    });
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateTournamentStatus(id: string, status: TournamentStatus): TournamentRecord | null {
    const t = this.tournaments.get(id);
    if (!t) return null;
    t.status = status;
    t.updatedAt = new Date().toISOString();
    if (status === 'RUNNING' && !t.startedAt) t.startedAt = t.updatedAt;
    if ((status === 'FINISHED' || status === 'CANCELLED') && !t.finishedAt)
      t.finishedAt = t.updatedAt;
    return t;
  }

  registerEntry(
    e: Omit<TournamentEntryRecord, 'id' | 'registeredAt' | 'status' | 'withdrawnAt'> & {
      id?: string;
      status?: EntryStatus;
    },
  ): TournamentEntryRecord {
    const t = this.tournaments.get(e.tournamentId);
    if (!t) throw new Error(`Tournament ${e.tournamentId} not found`);
    const list = this.entries.get(e.tournamentId)!;
    const dup = list.find(
      (x) =>
        x.captainUserId === e.captainUserId &&
        x.status !== 'WITHDRAWN' &&
        x.status !== 'KICKED',
    );
    if (dup) throw new Error(`Captain ${e.captainUserId} already registered in ${e.tournamentId}`);
    const active = list.filter((x) => x.status === 'CONFIRMED' || x.status === 'PENDING').length;
    if (active >= t.maxTeams) {
      throw new Error(`Tournament ${e.tournamentId} is full (maxTeams=${t.maxTeams})`);
    }
    const rec: TournamentEntryRecord = {
      id: e.id ?? makeId(),
      tournamentId: e.tournamentId,
      captainUserId: e.captainUserId,
      partnerUserId: e.partnerUserId,
      teamName: e.teamName,
      seed: e.seed,
      status: e.status ?? 'PENDING',
      registeredAt: new Date().toISOString(),
      withdrawnAt: null,
    };
    list.push(rec);
    this.entryIndex.set(rec.id, e.tournamentId);
    return rec;
  }

  updateEntryStatus(id: string, status: EntryStatus): TournamentEntryRecord | null {
    const tid = this.entryIndex.get(id);
    if (!tid) return null;
    const list = this.entries.get(tid);
    const entry = list?.find((x) => x.id === id);
    if (!entry) return null;
    entry.status = status;
    if (status === 'WITHDRAWN' || status === 'KICKED') {
      entry.withdrawnAt = new Date().toISOString();
    }
    return entry;
  }

  listEntries(tournamentId: string, filter?: { status?: EntryStatus }): TournamentEntryRecord[] {
    const list = this.entries.get(tournamentId) ?? [];
    if (!filter?.status) return [...list];
    return list.filter((e) => e.status === filter.status);
  }

  addRound(
    r: Omit<TournamentRoundRecord, 'id' | 'startedAt' | 'finishedAt'> & {
      id?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): TournamentRoundRecord {
    if (!this.tournaments.has(r.tournamentId))
      throw new Error(`Tournament ${r.tournamentId} not found`);
    const list = this.rounds.get(r.tournamentId)!;
    if (list.some((x) => x.roundIndex === r.roundIndex)) {
      throw new Error(`Round ${r.roundIndex} already exists in ${r.tournamentId}`);
    }
    const rec: TournamentRoundRecord = {
      id: r.id ?? makeId(),
      tournamentId: r.tournamentId,
      roundIndex: r.roundIndex,
      name: r.name,
      startedAt: r.startedAt ?? null,
      finishedAt: r.finishedAt ?? null,
    };
    list.push(rec);
    list.sort((a, b) => a.roundIndex - b.roundIndex);
    return rec;
  }

  listRounds(tournamentId: string): TournamentRoundRecord[] {
    return [...(this.rounds.get(tournamentId) ?? [])];
  }

  reset(): void {
    this.tournaments.clear();
    this.entries.clear();
    this.entryIndex.clear();
    this.rounds.clear();
  }
}
