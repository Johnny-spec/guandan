import { Module } from '@nestjs/common';
import { InMemoryMatchRepository, MATCH_REPOSITORY } from './match.repository.js';
import { RatingService } from './rating.service.js';
import { TierService } from './tier.service.js';
import { MatchService } from './match.service.js';
import { MatchController } from './match.controller.js';
import { InMemoryZSetLeaderboard, LEADERBOARD_CACHE } from './leaderboard.cache.js';

@Module({
  providers: [
    InMemoryMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: InMemoryMatchRepository },
    InMemoryZSetLeaderboard,
    { provide: LEADERBOARD_CACHE, useExisting: InMemoryZSetLeaderboard },
    RatingService,
    TierService,
    MatchService,
  ],
  controllers: [MatchController],
  exports: [MatchService, TierService, MATCH_REPOSITORY, LEADERBOARD_CACHE],
})
export class MatchModule {}
