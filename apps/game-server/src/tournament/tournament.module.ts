import { Module } from '@nestjs/common';
import {
  InMemoryTournamentRepository,
  TOURNAMENT_REPOSITORY,
} from './tournament.repository.js';

@Module({
  providers: [
    InMemoryTournamentRepository,
    { provide: TOURNAMENT_REPOSITORY, useExisting: InMemoryTournamentRepository },
  ],
  exports: [TOURNAMENT_REPOSITORY],
})
export class TournamentModule {}
