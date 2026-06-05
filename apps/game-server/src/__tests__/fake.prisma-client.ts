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
