import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module.js';
import { MatchModule } from './match/match.module.js';
import { ReplayModule } from './replay/replay.module.js';
import { RefereeModule } from './referee/referee.module.js';
import { TournamentModule } from './tournament/tournament.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    PrismaModule.forRoot(),
    MatchModule,
    ReplayModule,
    RefereeModule,
    TournamentModule,
    GameModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
