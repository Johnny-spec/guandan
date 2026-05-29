import { Module } from '@nestjs/common';
import { InMemoryMatchRepository, MATCH_REPOSITORY } from './match.repository.js';
import { RatingService } from './rating.service.js';
import { MatchService } from './match.service.js';
import { MatchController } from './match.controller.js';

@Module({
  providers: [
    InMemoryMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: InMemoryMatchRepository },
    RatingService,
    MatchService,
  ],
  controllers: [MatchController],
  exports: [MatchService, MATCH_REPOSITORY],
})
export class MatchModule {}
