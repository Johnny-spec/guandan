import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type {
  EntryStatus,
  TournamentEntryRecord,
  TournamentRecord,
  TournamentRoundRecord,
  TournamentStatus,
} from './tournament.repository.js';

export const TOURNAMENT_PRISMA_CLIENT = Symbol('TOURNAMENT_PRISMA_CLIENT');
export const ASYNC_TOURNAMENT_REPOSITORY = Symbol('ASYNC_TOURNAMENT_REPOSITORY');

/**
 * `TournamentRepository` 的 Prisma 异步孪生接口。
 *
 * 字段语义逐字段对齐 InMemory 实现；返回值统一包成 Promise，便于
 * Phase 4 之后切换 TournamentService 内部依赖到异步仓储。
 */
export interface AsyncTournamentRepository {
  createTournament(
    t: Omit<TournamentRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<TournamentRecord>;
  getTournament(id: string): Promise<TournamentRecord | null>;
  listTournaments(filter?: {
    status?: TournamentStatus;
    hostUserId?: string;
  }): Promise<TournamentRecord[]>;
  updateTournamentStatus(
    id: string,
    status: TournamentStatus,
  ): Promise<TournamentRecord | null>;
  registerEntry(
    e: Omit<TournamentEntryRecord, 'id' | 'registeredAt' | 'status' | 'withdrawnAt'> & {
      id?: string;
      status?: EntryStatus;
    },
  ): Promise<TournamentEntryRecord>;
  updateEntryStatus(
    id: string,
    status: EntryStatus,
  ): Promise<TournamentEntryRecord | null>;
  listEntries(
    tournamentId: string,
    filter?: { status?: EntryStatus },
  ): Promise<TournamentEntryRecord[]>;
  addRound(
    r: Omit<TournamentRoundRecord, 'id' | 'startedAt' | 'finishedAt'> & {
      id?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): Promise<TournamentRoundRecord>;
  listRounds(tournamentId: string): Promise<TournamentRoundRecord[]>;
}

// ---- Prisma row → DTO 转换 ----

type PrismaTournament = {
  id: string;
  name: string;
  hostUserId: string;
  format: 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'SWISS' | 'ROUND_ROBIN';
  status: 'DRAFT' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  maxTeams: number;
  startLevel: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaEntry = {
  id: string;
  tournamentId: string;
  captainUserId: string;
  partnerUserId: string | null;
  teamName: string;
  seed: number | null;
  status: 'PENDING' | 'CONFIRMED' | 'WITHDRAWN' | 'KICKED';
  registeredAt: Date;
  withdrawnAt: Date | null;
};

type PrismaRound = {
  id: string;
  tournamentId: string;
  roundIndex: number;
  name: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function toTournament(t: PrismaTournament): TournamentRecord {
  return {
    id: t.id,
    name: t.name,
    hostUserId: t.hostUserId,
    format: t.format,
    status: t.status,
    maxTeams: t.maxTeams,
    startLevel: t.startLevel,
    registrationOpensAt: t.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: t.registrationClosesAt?.toISOString() ?? null,
    startedAt: t.startedAt?.toISOString() ?? null,
    finishedAt: t.finishedAt?.toISOString() ?? null,
    description: t.description,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toEntry(e: PrismaEntry): TournamentEntryRecord {
  return {
    id: e.id,
    tournamentId: e.tournamentId,
    captainUserId: e.captainUserId,
    partnerUserId: e.partnerUserId,
    teamName: e.teamName,
    seed: e.seed,
    status: e.status,
    registeredAt: e.registeredAt.toISOString(),
    withdrawnAt: e.withdrawnAt?.toISOString() ?? null,
  };
}

function toRound(r: PrismaRound): TournamentRoundRecord {
  return {
    id: r.id,
    tournamentId: r.tournamentId,
    roundIndex: r.roundIndex,
    name: r.name,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Phase 4 Sprint 1 · 赛事 Postgres 异步仓储。
 *
 * - 同 `InMemoryTournamentRepository`：队长唯一性靠数据库 `@@unique([tournamentId, captainUserId])`
 *   守护；写入冲突时本类抛 `DUPLICATE_CAPTAIN` 错误，与 InMemory 行为对齐。
 * - 容量校验放在 service 层（与 InMemory 一致），因为依赖 maxTeams + 当前活跃报名计数，
 *   纯 SQL 约束难以表达。
 */
@Injectable()
export class PrismaTournamentRepository implements AsyncTournamentRepository {
  constructor(
    @Optional() @Inject(TOURNAMENT_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async createTournament(
    t: Omit<TournamentRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<TournamentRecord> {
    const row = await this.prisma.tournament.create({
      data: {
        ...(t.id ? { id: t.id } : {}),
        name: t.name,
        hostUserId: t.hostUserId,
        format: t.format,
        status: t.status,
        maxTeams: t.maxTeams,
        startLevel: t.startLevel,
        registrationOpensAt: t.registrationOpensAt ? new Date(t.registrationOpensAt) : null,
        registrationClosesAt: t.registrationClosesAt ? new Date(t.registrationClosesAt) : null,
        startedAt: t.startedAt ? new Date(t.startedAt) : null,
        finishedAt: t.finishedAt ? new Date(t.finishedAt) : null,
        description: t.description,
      },
    });
    return toTournament(row as unknown as PrismaTournament);
  }

  async getTournament(id: string): Promise<TournamentRecord | null> {
    const row = await this.prisma.tournament.findUnique({ where: { id } });
    return row ? toTournament(row as unknown as PrismaTournament) : null;
  }

  async listTournaments(filter?: {
    status?: TournamentStatus;
    hostUserId?: string;
  }): Promise<TournamentRecord[]> {
    const rows = await this.prisma.tournament.findMany({
      where: {
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.hostUserId ? { hostUserId: filter.hostUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return (rows as unknown as PrismaTournament[]).map(toTournament);
  }

  async updateTournamentStatus(
    id: string,
    status: TournamentStatus,
  ): Promise<TournamentRecord | null> {
    try {
      const now = new Date();
      const existing = await this.prisma.tournament.findUnique({ where: { id } });
      if (!existing) return null;
      const ex = existing as unknown as PrismaTournament;
      const startedAt =
        status === 'RUNNING' && !ex.startedAt ? now : ex.startedAt;
      const finishedAt =
        (status === 'FINISHED' || status === 'CANCELLED') && !ex.finishedAt
          ? now
          : ex.finishedAt;
      const row = await this.prisma.tournament.update({
        where: { id },
        data: { status, startedAt, finishedAt },
      });
      return toTournament(row as unknown as PrismaTournament);
    } catch {
      return null;
    }
  }

  async registerEntry(
    e: Omit<TournamentEntryRecord, 'id' | 'registeredAt' | 'status' | 'withdrawnAt'> & {
      id?: string;
      status?: EntryStatus;
    },
  ): Promise<TournamentEntryRecord> {
    try {
      const row = await this.prisma.tournamentEntry.create({
        data: {
          ...(e.id ? { id: e.id } : {}),
          tournamentId: e.tournamentId,
          captainUserId: e.captainUserId,
          partnerUserId: e.partnerUserId,
          teamName: e.teamName,
          seed: e.seed,
          status: e.status ?? 'PENDING',
        },
      });
      return toEntry(row as unknown as PrismaEntry);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        throw new Error(
          `Captain ${e.captainUserId} already registered in ${e.tournamentId}`,
        );
      }
      throw err;
    }
  }

  async updateEntryStatus(
    id: string,
    status: EntryStatus,
  ): Promise<TournamentEntryRecord | null> {
    try {
      const withdrawnAt =
        status === 'WITHDRAWN' || status === 'KICKED' ? new Date() : undefined;
      const row = await this.prisma.tournamentEntry.update({
        where: { id },
        data: { status, ...(withdrawnAt ? { withdrawnAt } : {}) },
      });
      return toEntry(row as unknown as PrismaEntry);
    } catch {
      return null;
    }
  }

  async listEntries(
    tournamentId: string,
    filter?: { status?: EntryStatus },
  ): Promise<TournamentEntryRecord[]> {
    const rows = await this.prisma.tournamentEntry.findMany({
      where: {
        tournamentId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { registeredAt: 'asc' },
    });
    return (rows as unknown as PrismaEntry[]).map(toEntry);
  }

  async addRound(
    r: Omit<TournamentRoundRecord, 'id' | 'startedAt' | 'finishedAt'> & {
      id?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): Promise<TournamentRoundRecord> {
    try {
      const row = await this.prisma.tournamentRound.create({
        data: {
          ...(r.id ? { id: r.id } : {}),
          tournamentId: r.tournamentId,
          roundIndex: r.roundIndex,
          name: r.name,
          startedAt: r.startedAt ? new Date(r.startedAt) : null,
          finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
        },
      });
      return toRound(row as unknown as PrismaRound);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        throw new Error(`Round ${r.roundIndex} already exists in ${r.tournamentId}`);
      }
      throw err;
    }
  }

  async listRounds(tournamentId: string): Promise<TournamentRoundRecord[]> {
    const rows = await this.prisma.tournamentRound.findMany({
      where: { tournamentId },
      orderBy: { roundIndex: 'asc' },
    });
    return (rows as unknown as PrismaRound[]).map(toRound);
  }
}
