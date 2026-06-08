import { Module } from '@nestjs/common';
import {
  InMemoryTournamentRepository,
  TOURNAMENT_REPOSITORY,
} from './tournament.repository.js';
import { TournamentService } from './tournament.service.js';
import {
  TournamentController,
  TournamentEntryController,
} from './tournament.controller.js';

@Module({
  providers: [
    InMemoryTournamentRepository,
    { provide: TOURNAMENT_REPOSITORY, useExisting: InMemoryTournamentRepository },
    TournamentService,
  ],
  controllers: [TournamentController, TournamentEntryController],
  exports: [TOURNAMENT_REPOSITORY, TournamentService],
})
export class TournamentModule {}
