/**
 * 用于集成测试的 PrismaClient 内存替身。
 *
 * 仅实现 `PrismaMatchRepository` 实际使用到的方法子集，按 Prisma row 语义模拟：
 *   - user.{upsert, findUnique, update, findMany}
 *   - match.{create, update, findUnique, findMany, count}
 *   - matchPlayer.update (复合主键)
 *   - ratingEvent.{create, findMany}
 *   - $transaction（数组 + interactive 回调）
 *
 * 不是真正的 Postgres，但能验证：DTO 转换 / cursor 翻页 / 事务回滚 / 嵌套创建
 * 的语义路径与生产实现一致。完整 SQL 集成由 docker-compose Postgres + e2e 覆盖。
 */
type UserRow = {
  id: string;
  displayName: string;
  kind: 'HUMAN' | 'BOT';
  rating: number;
  matchesTotal: number;
  matchesWon: number;
  lastSeenAt: Date | null;
  createdAt: Date;
};

type MatchPlayerRow = {
  matchId: string;
  userId: string;
  seat: 'N' | 'E' | 'S' | 'W';
  team: 'NS' | 'EW';
  isBot: boolean;
  botDifficulty: string | null;
  finishOrder: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingDelta: number | null;
};

type MatchRow = {
  id: string;
  roomId: string;
  kind: 'CASUAL' | 'RANKED' | 'AI_TRAINING' | 'TOURNAMENT';
  result: 'PENDING' | 'COMPLETED' | 'ABORTED' | 'DRAW';
  winnerTeam: string | null;
  startLevel: string;
  endLevel: string | null;
  hasAiPlayers: boolean;
  durationMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type RatingEventRow = {
  id: bigint;
  userId: string;
  matchId: string | null;
  seasonId: string | null;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
  reason: string;
  at: Date;
};

type TournamentRow = {
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

type TournamentEntryRow = {
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

type TournamentRoundRow = {
  id: string;
  tournamentId: string;
  roundIndex: number;
  name: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type GuildRow = {
  id: string;
  name: string;
  tag: string | null;
  ownerUserId: string;
  description: string | null;
  maxMembers: number;
  joinPolicy: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  disbandedAt: Date | null;
};

type GuildMembershipRow = {
  id: string;
  guildId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'ACTIVE' | 'LEFT' | 'KICKED';
  joinedAt: Date;
  leftAt: Date | null;
};

type IncrementOp = { increment: number };
function isIncrement(v: unknown): v is IncrementOp {
  return typeof v === 'object' && v !== null && 'increment' in v;
}
function applyNum(prev: number, op: number | IncrementOp | undefined): number {
  if (op === undefined) return prev;
  if (isIncrement(op)) return prev + op.increment;
  return op;
}

export class FakePrismaClient {
  private users = new Map<string, UserRow>();
  private matches = new Map<string, MatchRow>();
  private players: MatchPlayerRow[] = [];
  private ratingEvents: RatingEventRow[] = [];
  private tournaments = new Map<string, TournamentRow>();
  private tournamentEntries: TournamentEntryRow[] = [];
  private tournamentRounds: TournamentRoundRow[] = [];
  private guilds = new Map<string, GuildRow>();
  private guildMemberships: GuildMembershipRow[] = [];
  private idCounter = 1;
  private bigIdCounter = 1n;

  private nextId(): string {
    return `gen_${this.idCounter++}`;
  }

  // --- $transaction（数组 + 回调） ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $transaction(arg: any): Promise<any> {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === 'function') {
      // 简化：失败时不回滚（测试可显式断言失败 → 我们抛错让上层 catch）
      return arg(this);
    }
    throw new Error('unsupported $transaction arg');
  }

  // --- user ---
  user = {
    upsert: async (args: {
      where: { id: string };
      update: Partial<UserRow>;
      create: Partial<UserRow> & { id: string; displayName: string; kind: 'HUMAN' | 'BOT' };
    }): Promise<UserRow> => {
      const existing = this.users.get(args.where.id);
      if (existing) {
        const merged: UserRow = { ...existing, ...args.update };
        this.users.set(existing.id, merged);
        return merged;
      }
      const row: UserRow = {
        id: args.create.id,
        displayName: args.create.displayName,
        kind: args.create.kind,
        rating: args.create.rating ?? 1000,
        matchesTotal: args.create.matchesTotal ?? 0,
        matchesWon: args.create.matchesWon ?? 0,
        lastSeenAt: args.create.lastSeenAt ?? null,
        createdAt: args.create.createdAt ?? new Date(),
      };
      this.users.set(row.id, row);
      return row;
    },

    findUnique: async (args: { where: { id: string } }): Promise<UserRow | null> => {
      return this.users.get(args.where.id) ?? null;
    },

    update: async (args: {
      where: { id: string };
      data: {
        rating?: number | IncrementOp;
        matchesTotal?: number | IncrementOp;
        matchesWon?: number | IncrementOp;
        lastSeenAt?: Date;
        displayName?: string;
      };
    }): Promise<UserRow> => {
      const row = this.users.get(args.where.id);
      if (!row) throw new Error(`user not found: ${args.where.id}`);
      const next: UserRow = {
        ...row,
        rating: applyNum(row.rating, args.data.rating),
        matchesTotal: applyNum(row.matchesTotal, args.data.matchesTotal),
        matchesWon: applyNum(row.matchesWon, args.data.matchesWon),
        lastSeenAt: args.data.lastSeenAt ?? row.lastSeenAt,
        displayName: args.data.displayName ?? row.displayName,
      };
      this.users.set(row.id, next);
      return next;
    },

    findMany: async (args: {
      where?: { kind?: 'HUMAN' | 'BOT'; matchesTotal?: { gt?: number } };
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
      select?: Record<string, boolean>;
    }): Promise<Array<Partial<UserRow>>> => {
      let rows = [...this.users.values()];
      if (args.where?.kind) rows = rows.filter((r) => r.kind === args.where!.kind);
      if (args.where?.matchesTotal?.gt !== undefined) {
        const gt = args.where.matchesTotal.gt;
        rows = rows.filter((r) => r.matchesTotal > gt);
      }
      if (args.orderBy) {
        const order = args.orderBy;
        rows.sort((a, b) => {
          for (const clause of order) {
            const [k, dir] = Object.entries(clause)[0]!;
            const va = (a as unknown as Record<string, number>)[k]!;
            const vb = (b as unknown as Record<string, number>)[k]!;
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      if (args.select) {
        const sel = args.select;
        return rows.map((r) => {
          const out: Record<string, unknown> = {};
          for (const [k, on] of Object.entries(sel)) {
            if (on) out[k] = (r as unknown as Record<string, unknown>)[k];
          }
          return out as Partial<UserRow>;
        });
      }
      return rows;
    },
  };

  // --- match / matchPlayer ---
  match = {
    create: async (args: {
      data: Omit<MatchRow, 'id'> & {
        id?: string;
        players: { create: Array<Omit<MatchPlayerRow, 'matchId'>> };
      };
      include?: unknown;
    }): Promise<MatchRow & { players: Array<MatchPlayerRow & { user: { displayName: string } }> }> => {
      const id = args.data.id ?? this.nextId();
      const row: MatchRow = {
        id,
        roomId: args.data.roomId,
        kind: args.data.kind,
        result: args.data.result,
        winnerTeam: args.data.winnerTeam,
        startLevel: args.data.startLevel,
        endLevel: args.data.endLevel,
        hasAiPlayers: args.data.hasAiPlayers,
        durationMs: args.data.durationMs,
        startedAt: args.data.startedAt,
        finishedAt: args.data.finishedAt,
      };
      this.matches.set(id, row);
      for (const p of args.data.players.create) {
        this.players.push({ ...p, matchId: id });
      }
      return this.matchWithPlayers(id)!;
    },

    update: async (args: {
      where: { id: string };
      data: Partial<MatchRow>;
    }): Promise<MatchRow> => {
      const row = this.matches.get(args.where.id);
      if (!row) throw new Error(`match not found: ${args.where.id}`);
      const next: MatchRow = { ...row, ...args.data };
      this.matches.set(row.id, next);
      return next;
    },

    findUnique: async (args: { where: { id: string }; include?: unknown }) => {
      return this.matchWithPlayers(args.where.id);
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: async (args: any): Promise<unknown[]> => {
      const filtered = this.filterMatches(args.where ?? {});
      const ordered = this.sortMatches(filtered, args.orderBy);
      const limited = args.take !== undefined ? ordered.slice(0, args.take) : ordered;
      return limited.map((m) => this.matchWithPlayers(m.id)!);
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count: async (args: { where?: any }): Promise<number> => {
      return this.filterMatches(args.where ?? {}).length;
    },
  };

  matchPlayer = {
    update: async (args: {
      where: { matchId_userId: { matchId: string; userId: string } };
      data: Partial<MatchPlayerRow>;
    }): Promise<MatchPlayerRow> => {
      const { matchId, userId } = args.where.matchId_userId;
      const idx = this.players.findIndex((p) => p.matchId === matchId && p.userId === userId);
      if (idx < 0) throw new Error(`matchPlayer not found: ${matchId}/${userId}`);
      const merged: MatchPlayerRow = { ...this.players[idx]!, ...args.data };
      this.players[idx] = merged;
      return merged;
    },
  };

  ratingEvent = {
    create: async (args: {
      data: Omit<RatingEventRow, 'id' | 'at'> & { at?: Date };
    }): Promise<RatingEventRow> => {
      const row: RatingEventRow = {
        id: this.bigIdCounter++,
        userId: args.data.userId,
        matchId: args.data.matchId ?? null,
        seasonId: args.data.seasonId ?? null,
        delta: args.data.delta,
        ratingBefore: args.data.ratingBefore,
        ratingAfter: args.data.ratingAfter,
        reason: args.data.reason,
        at: args.data.at ?? new Date(),
      };
      this.ratingEvents.push(row);
      return row;
    },

    findMany: async (args: {
      where: { userId: string };
      orderBy?: { at?: 'asc' | 'desc' };
      take?: number;
    }): Promise<RatingEventRow[]> => {
      let rows = this.ratingEvents.filter((r) => r.userId === args.where.userId);
      if (args.orderBy?.at === 'desc') rows = [...rows].sort((a, b) => +b.at - +a.at);
      if (args.orderBy?.at === 'asc') rows = [...rows].sort((a, b) => +a.at - +b.at);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows;
    },
  };

  // --- tournament / tournamentEntry / tournamentRound ---
  tournament = {
    create: async (args: {
      data: Partial<TournamentRow> & {
        id?: string;
        name: string;
        hostUserId: string;
        format: TournamentRow['format'];
        status: TournamentRow['status'];
        maxTeams: number;
        startLevel: string;
      };
    }): Promise<TournamentRow> => {
      const now = new Date();
      const id = args.data.id ?? this.nextId();
      const row: TournamentRow = {
        id,
        name: args.data.name,
        hostUserId: args.data.hostUserId,
        format: args.data.format,
        status: args.data.status,
        maxTeams: args.data.maxTeams,
        startLevel: args.data.startLevel,
        registrationOpensAt: args.data.registrationOpensAt ?? null,
        registrationClosesAt: args.data.registrationClosesAt ?? null,
        startedAt: args.data.startedAt ?? null,
        finishedAt: args.data.finishedAt ?? null,
        description: args.data.description ?? null,
        createdAt: args.data.createdAt ?? now,
        updatedAt: args.data.updatedAt ?? now,
      };
      this.tournaments.set(id, row);
      return row;
    },

    findUnique: async (args: { where: { id: string } }): Promise<TournamentRow | null> => {
      return this.tournaments.get(args.where.id) ?? null;
    },

    findMany: async (args: {
      where?: { status?: TournamentRow['status']; hostUserId?: string };
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<TournamentRow[]> => {
      let rows = [...this.tournaments.values()];
      if (args.where?.status) rows = rows.filter((r) => r.status === args.where!.status);
      if (args.where?.hostUserId)
        rows = rows.filter((r) => r.hostUserId === args.where!.hostUserId);
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0]!;
        rows.sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[k] as Date | number | string;
          const vb = (b as unknown as Record<string, unknown>)[k] as Date | number | string;
          const na = va instanceof Date ? +va : va;
          const nb = vb instanceof Date ? +vb : vb;
          if (na < nb) return dir === 'asc' ? -1 : 1;
          if (na > nb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return rows;
    },

    update: async (args: {
      where: { id: string };
      data: Partial<TournamentRow>;
    }): Promise<TournamentRow> => {
      const row = this.tournaments.get(args.where.id);
      if (!row) throw new Error(`tournament not found: ${args.where.id}`);
      const next: TournamentRow = { ...row, ...args.data, updatedAt: new Date() };
      this.tournaments.set(row.id, next);
      return next;
    },
  };

  tournamentEntry = {
    create: async (args: {
      data: Partial<TournamentEntryRow> & {
        id?: string;
        tournamentId: string;
        captainUserId: string;
        teamName: string;
      };
    }): Promise<TournamentEntryRow> => {
      const dup = this.tournamentEntries.find(
        (e) =>
          e.tournamentId === args.data.tournamentId &&
          e.captainUserId === args.data.captainUserId,
      );
      if (dup) {
        const err = new Error('Unique constraint failed') as Error & { code?: string };
        err.code = 'P2002';
        throw err;
      }
      const row: TournamentEntryRow = {
        id: args.data.id ?? this.nextId(),
        tournamentId: args.data.tournamentId,
        captainUserId: args.data.captainUserId,
        partnerUserId: args.data.partnerUserId ?? null,
        teamName: args.data.teamName,
        seed: args.data.seed ?? null,
        status: args.data.status ?? 'PENDING',
        registeredAt: args.data.registeredAt ?? new Date(),
        withdrawnAt: args.data.withdrawnAt ?? null,
      };
      this.tournamentEntries.push(row);
      return row;
    },

    update: async (args: {
      where: { id: string };
      data: Partial<TournamentEntryRow>;
    }): Promise<TournamentEntryRow> => {
      const idx = this.tournamentEntries.findIndex((e) => e.id === args.where.id);
      if (idx < 0) throw new Error(`tournamentEntry not found: ${args.where.id}`);
      const merged: TournamentEntryRow = { ...this.tournamentEntries[idx]!, ...args.data };
      this.tournamentEntries[idx] = merged;
      return merged;
    },

    findMany: async (args: {
      where?: { tournamentId?: string; status?: TournamentEntryRow['status'] };
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<TournamentEntryRow[]> => {
      let rows = [...this.tournamentEntries];
      if (args.where?.tournamentId)
        rows = rows.filter((e) => e.tournamentId === args.where!.tournamentId);
      if (args.where?.status) rows = rows.filter((e) => e.status === args.where!.status);
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0]!;
        rows.sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[k] as Date | number | string;
          const vb = (b as unknown as Record<string, unknown>)[k] as Date | number | string;
          const na = va instanceof Date ? +va : va;
          const nb = vb instanceof Date ? +vb : vb;
          if (na < nb) return dir === 'asc' ? -1 : 1;
          if (na > nb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return rows;
    },
  };

  tournamentRound = {
    create: async (args: {
      data: Partial<TournamentRoundRow> & {
        id?: string;
        tournamentId: string;
        roundIndex: number;
      };
    }): Promise<TournamentRoundRow> => {
      const dup = this.tournamentRounds.find(
        (r) =>
          r.tournamentId === args.data.tournamentId &&
          r.roundIndex === args.data.roundIndex,
      );
      if (dup) {
        const err = new Error('Unique constraint failed') as Error & { code?: string };
        err.code = 'P2002';
        throw err;
      }
      const row: TournamentRoundRow = {
        id: args.data.id ?? this.nextId(),
        tournamentId: args.data.tournamentId,
        roundIndex: args.data.roundIndex,
        name: args.data.name ?? null,
        startedAt: args.data.startedAt ?? null,
        finishedAt: args.data.finishedAt ?? null,
      };
      this.tournamentRounds.push(row);
      return row;
    },

    findMany: async (args: {
      where?: { tournamentId?: string };
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<TournamentRoundRow[]> => {
      let rows = [...this.tournamentRounds];
      if (args.where?.tournamentId)
        rows = rows.filter((r) => r.tournamentId === args.where!.tournamentId);
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0]!;
        rows.sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[k] as number;
          const vb = (b as unknown as Record<string, unknown>)[k] as number;
          if (va < vb) return dir === 'asc' ? -1 : 1;
          if (va > vb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return rows;
    },
  };

  // --- guild ---
  guild = {
    create: async (args: { data: Partial<GuildRow> & { name: string; ownerUserId: string } }): Promise<GuildRow> => {
      const d = args.data;
      for (const g of this.guilds.values()) {
        if (g.name === d.name) {
          const err = new Error('Unique constraint failed') as Error & { code?: string; meta?: { target: string[] } };
          err.code = 'P2002';
          err.meta = { target: ['name'] };
          throw err;
        }
        if (d.tag != null && g.tag === d.tag) {
          const err = new Error('Unique constraint failed') as Error & { code?: string; meta?: { target: string[] } };
          err.code = 'P2002';
          err.meta = { target: ['tag'] };
          throw err;
        }
      }
      const now = new Date();
      const row: GuildRow = {
        id: d.id ?? this.nextId(),
        name: d.name,
        tag: d.tag ?? null,
        ownerUserId: d.ownerUserId,
        description: d.description ?? null,
        maxMembers: d.maxMembers ?? 50,
        joinPolicy: d.joinPolicy ?? 'APPROVAL',
        tenantId: d.tenantId ?? null,
        createdAt: d.createdAt ?? now,
        updatedAt: d.updatedAt ?? now,
        disbandedAt: d.disbandedAt ?? null,
      };
      this.guilds.set(row.id, row);
      return row;
    },

    findUnique: async (args: { where: { id?: string; name?: string; tag?: string } }): Promise<GuildRow | null> => {
      if (args.where.id) return this.guilds.get(args.where.id) ?? null;
      if (args.where.name) {
        for (const g of this.guilds.values()) if (g.name === args.where.name) return g;
        return null;
      }
      if (args.where.tag) {
        for (const g of this.guilds.values()) if (g.tag === args.where.tag) return g;
        return null;
      }
      return null;
    },

    findMany: async (args: {
      where?: { tenantId?: string; disbandedAt?: null };
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<GuildRow[]> => {
      let rows = [...this.guilds.values()];
      if (args.where && 'tenantId' in args.where) {
        rows = rows.filter((g) => g.tenantId === args.where!.tenantId);
      }
      if (args.where && 'disbandedAt' in args.where && args.where.disbandedAt === null) {
        rows = rows.filter((g) => g.disbandedAt === null);
      }
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0]!;
        rows.sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[k] as Date | number | string;
          const vb = (b as unknown as Record<string, unknown>)[k] as Date | number | string;
          const na = va instanceof Date ? +va : va;
          const nb = vb instanceof Date ? +vb : vb;
          if (na < nb) return dir === 'asc' ? -1 : 1;
          if (na > nb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return rows;
    },

    update: async (args: { where: { id: string }; data: Partial<GuildRow> }): Promise<GuildRow> => {
      const row = this.guilds.get(args.where.id);
      if (!row) throw new Error(`guild not found: ${args.where.id}`);
      if (args.data.tag != null && args.data.tag !== row.tag) {
        for (const g of this.guilds.values()) {
          if (g.id !== row.id && g.tag === args.data.tag) {
            const err = new Error('Unique constraint failed') as Error & { code?: string; meta?: { target: string[] } };
            err.code = 'P2002';
            err.meta = { target: ['tag'] };
            throw err;
          }
        }
      }
      const next: GuildRow = { ...row, ...args.data, updatedAt: new Date() };
      this.guilds.set(row.id, next);
      return next;
    },
  };

  guildMembership = {
    create: async (args: {
      data: Partial<GuildMembershipRow> & { guildId: string; userId: string };
    }): Promise<GuildMembershipRow> => {
      const dup = this.guildMemberships.find(
        (m) => m.guildId === args.data.guildId && m.userId === args.data.userId,
      );
      if (dup) {
        const err = new Error('Unique constraint failed') as Error & { code?: string };
        err.code = 'P2002';
        throw err;
      }
      const row: GuildMembershipRow = {
        id: args.data.id ?? this.nextId(),
        guildId: args.data.guildId,
        userId: args.data.userId,
        role: args.data.role ?? 'MEMBER',
        status: args.data.status ?? 'PENDING',
        joinedAt: args.data.joinedAt ?? new Date(),
        leftAt: args.data.leftAt ?? null,
      };
      this.guildMemberships.push(row);
      return row;
    },

    update: async (args: {
      where: { id: string };
      data: Partial<GuildMembershipRow>;
    }): Promise<GuildMembershipRow> => {
      const idx = this.guildMemberships.findIndex((m) => m.id === args.where.id);
      if (idx < 0) throw new Error(`guildMembership not found: ${args.where.id}`);
      const merged: GuildMembershipRow = { ...this.guildMemberships[idx]!, ...args.data };
      this.guildMemberships[idx] = merged;
      return merged;
    },

    findMany: async (args: {
      where?: {
        guildId?: string;
        userId?: string;
        status?: GuildMembershipRow['status'] | { in: GuildMembershipRow['status'][] };
      };
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<GuildMembershipRow[]> => {
      let rows = [...this.guildMemberships];
      if (args.where?.guildId) rows = rows.filter((m) => m.guildId === args.where!.guildId);
      if (args.where?.userId) rows = rows.filter((m) => m.userId === args.where!.userId);
      const s = args.where?.status;
      if (s) {
        if (typeof s === 'object' && 'in' in s) rows = rows.filter((m) => s.in.includes(m.status));
        else rows = rows.filter((m) => m.status === s);
      }
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0]!;
        rows.sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[k] as Date | number | string;
          const vb = (b as unknown as Record<string, unknown>)[k] as Date | number | string;
          const na = va instanceof Date ? +va : va;
          const nb = vb instanceof Date ? +vb : vb;
          if (na < nb) return dir === 'asc' ? -1 : 1;
          if (na > nb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return rows;
    },
  };

  // --- helpers ---
  private matchWithPlayers(id: string) {
    const m = this.matches.get(id);
    if (!m) return null;
    const ps = this.players
      .filter((p) => p.matchId === id)
      .map((p) => {
        const user = this.users.get(p.userId);
        return { ...p, user: { displayName: user?.displayName ?? '???' } };
      });
    return { ...m, players: ps };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private filterMatches(where: any): MatchRow[] {
    let rows = [...this.matches.values()];
    if (where.players?.some?.userId) {
      const uid = where.players.some.userId as string;
      const matchIds = new Set(this.players.filter((p) => p.userId === uid).map((p) => p.matchId));
      rows = rows.filter((m) => matchIds.has(m.id));
    }
    if (where.result) rows = rows.filter((m) => m.result === where.result);
    if (where.startedAt) {
      const sa = where.startedAt as { gte?: Date; lt?: Date };
      if (sa.gte) rows = rows.filter((m) => +m.startedAt >= +sa.gte!);
      if (sa.lt) rows = rows.filter((m) => +m.startedAt < +sa.lt!);
    }
    if (Array.isArray(where.OR)) {
      rows = rows.filter((m) => where.OR.some((clause: unknown) => matchClause(m, clause)));
    }
    return rows;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sortMatches(rows: MatchRow[], orderBy: any): MatchRow[] {
    if (!orderBy) return rows;
    const clauses: Array<Record<string, 'asc' | 'desc'>> = Array.isArray(orderBy)
      ? orderBy
      : [orderBy];
    return [...rows].sort((a, b) => {
      for (const c of clauses) {
        const [k, dir] = Object.entries(c)[0]!;
        const va = (a as unknown as Record<string, unknown>)[k] as number | string | Date;
        const vb = (b as unknown as Record<string, unknown>)[k] as number | string | Date;
        const na = va instanceof Date ? +va : va;
        const nb = vb instanceof Date ? +vb : vb;
        if (na < nb) return dir === 'asc' ? -1 : 1;
        if (na > nb) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
}

function matchClause(m: MatchRow, clause: unknown): boolean {
  if (typeof clause !== 'object' || clause === null) return false;
  const c = clause as Record<string, unknown>;
  if (c.startedAt) {
    const sa = c.startedAt as { lt?: Date } | Date;
    if (sa instanceof Date) {
      if (+m.startedAt !== +sa) return false;
    } else if (sa.lt !== undefined) {
      if (!(+m.startedAt < +sa.lt)) return false;
    }
  }
  if (c.id) {
    const idc = c.id as { lt?: string };
    if (idc.lt !== undefined && !(m.id < idc.lt)) return false;
  }
  if (Array.isArray(c.AND)) {
    return (c.AND as unknown[]).every((sub) => matchClause(m, sub));
  }
  return true;
}
