/**
 * Prisma seed 脚本。
 *
 * 用途：本地 / dev 环境一键填充演示数据。
 *   - 4 个 HUMAN 用户 + 4 个 BOT 用户
 *   - 1 个已完成的演示对局（NS 队胜）
 *   - 4 条 RatingEvent（胜方 +24 / 负方 -24）
 *
 * 触发：`pnpm --filter @teams-guandan/game-server prisma:seed`
 *   （要求 DATABASE_URL 已配置且 schema 已迁移）
 *
 * 设计原则：
 *   - 幂等：所有写入用 `upsert` / `findFirst + create`，可重复执行
 *   - 只塞演示数据，不动 schema 元数据
 *   - 不依赖 RatingService / MatchService，避免循环依赖；直接走 PrismaClient
 */
import {
  PrismaClient,
  AccountKind,
  MatchKind,
  MatchResult,
  RoomPhase,
  RoomVisibility,
  Seat,
  Team,
} from '@prisma/client';

const prisma = new PrismaClient();

const HUMANS = [
  { id: 'demo-alice', displayName: 'Alice' },
  { id: 'demo-bob', displayName: 'Bob' },
  { id: 'demo-carol', displayName: 'Carol' },
  { id: 'demo-dave', displayName: 'Dave' },
];

const BOTS = [
  { id: 'demo-bot-1', displayName: 'Bot 一号' },
  { id: 'demo-bot-2', displayName: 'Bot 二号' },
  { id: 'demo-bot-3', displayName: 'Bot 三号' },
  { id: 'demo-bot-4', displayName: 'Bot 四号' },
];

async function main(): Promise<void> {
  console.log('[seed] start');

  for (const u of HUMANS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { displayName: u.displayName },
      create: { id: u.id, displayName: u.displayName, kind: AccountKind.HUMAN, rating: 1000 },
    });
  }
  for (const u of BOTS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { displayName: u.displayName },
      create: { id: u.id, displayName: u.displayName, kind: AccountKind.BOT, rating: 1000 },
    });
  }
  console.log(`[seed] users: ${HUMANS.length + BOTS.length}`);

  const DEMO_MATCH_ID = 'demo-match-1';
  const DEMO_ROOM_ID = 'demoroom';
  await prisma.room.upsert({
    where: { id: DEMO_ROOM_ID },
    update: {},
    create: {
      id: DEMO_ROOM_ID,
      hostUserId: HUMANS[0]!.id,
      visibility: RoomVisibility.PUBLIC,
      level: '2',
      phase: RoomPhase.FINISHED,
    },
  });
  const existing = await prisma.match.findUnique({ where: { id: DEMO_MATCH_ID } });
  if (!existing) {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000);
    const finishedAt = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.match.create({
      data: {
        id: DEMO_MATCH_ID,
        roomId: DEMO_ROOM_ID,
        kind: MatchKind.CASUAL,
        result: MatchResult.COMPLETED,
        winnerTeam: Team.NS,
        startLevel: '2',
        endLevel: '3',
        hasAiPlayers: false,
        durationMs: 20 * 60 * 1000,
        startedAt,
        finishedAt,
        players: {
          create: [
            seatRow(HUMANS[0]!.id, Seat.N, Team.NS, 1, +24),
            seatRow(HUMANS[2]!.id, Seat.S, Team.NS, 2, +24),
            seatRow(HUMANS[1]!.id, Seat.E, Team.EW, 3, -24),
            seatRow(HUMANS[3]!.id, Seat.W, Team.EW, 4, -24),
          ],
        },
      },
    });
    for (const p of [
      { userId: HUMANS[0]!.id, delta: +24 },
      { userId: HUMANS[2]!.id, delta: +24 },
      { userId: HUMANS[1]!.id, delta: -24 },
      { userId: HUMANS[3]!.id, delta: -24 },
    ]) {
      await prisma.ratingEvent.create({
        data: {
          userId: p.userId,
          matchId: DEMO_MATCH_ID,
          delta: p.delta,
          ratingBefore: 1000,
          ratingAfter: 1000 + p.delta,
          reason: p.delta > 0 ? 'match_win' : 'match_loss',
          at: finishedAt,
        },
      });
      await prisma.user.update({
        where: { id: p.userId },
        data: {
          rating: 1000 + p.delta,
          matchesTotal: { increment: 1 },
          matchesWon: p.delta > 0 ? { increment: 1 } : undefined,
        },
      });
    }
    console.log(`[seed] demo match ${DEMO_MATCH_ID} created`);
  } else {
    console.log(`[seed] demo match ${DEMO_MATCH_ID} exists, skip`);
  }

  console.log('[seed] done');
}

function seatRow(
  userId: string,
  seat: Seat,
  team: Team,
  finishOrder: number,
  ratingDelta: number,
) {
  return {
    userId,
    seat,
    team,
    isBot: false,
    finishOrder,
    ratingBefore: 1000,
    ratingAfter: 1000 + ratingDelta,
    ratingDelta,
  };
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
