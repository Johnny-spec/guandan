import { Module } from '@nestjs/common';
import { InMemoryMatchRepository, MATCH_REPOSITORY } from './match.repository.js';
import { RatingService } from './rating.service.js';
import { TierService } from './tier.service.js';
import { MatchService } from './match.service.js';
import { MatchController } from './match.controller.js';

@Module({
  providers: [
    InMemoryMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: InMemoryMatchRepository },
    RatingService,
    TierService,
    MatchService,
  ],
  controllers: [MatchController],
  exports: [MatchService, TierService, MATCH_REPOSITORY],
})
export class MatchModule {}
