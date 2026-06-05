import { Module, type Provider } from '@nestjs/common';
import { InMemoryMatchRepository, MATCH_REPOSITORY } from './match.repository.js';
import { RatingService } from './rating.service.js';
import { TierService } from './tier.service.js';
import { MatchService } from './match.service.js';
import { MatchController } from './match.controller.js';
import { InMemoryZSetLeaderboard, LEADERBOARD_CACHE } from './leaderboard.cache.js';
import {
  ASYNC_MATCH_REPOSITORY,
  PrismaMatchRepository,
} from './prisma.match.repository.js';

/**
 * 是否启用 Prisma 异步仓储。
 * - `DATABASE_URL` 配置且非空 → 绑定 ASYNC_MATCH_REPOSITORY = PrismaMatchRepository
 *   （PRISMA_CLIENT 由全局 PrismaModule 提供）
 * - 同步 InMemoryMatchRepository 仍是 MATCH_REPOSITORY 默认实现（迁移期保留）
 */
const prismaProviders: Provider[] =
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== ''
    ? [
        PrismaMatchRepository,
        { provide: ASYNC_MATCH_REPOSITORY, useExisting: PrismaMatchRepository },
      ]
    : [];

@Module({
  providers: [
    InMemoryMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: InMemoryMatchRepository },
    InMemoryZSetLeaderboard,
    { provide: LEADERBOARD_CACHE, useExisting: InMemoryZSetLeaderboard },
    RatingService,
    TierService,
    MatchService,
    ...prismaProviders,
  ],
  controllers: [MatchController],
  exports: [
    MatchService,
    TierService,
    MATCH_REPOSITORY,
    LEADERBOARD_CACHE,
    ...(prismaProviders.length ? [ASYNC_MATCH_REPOSITORY] : []),
  ],
})
export class MatchModule {}
