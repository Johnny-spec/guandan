import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module.js';
import { MatchModule } from './match/match.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [MatchModule, GameModule],
  controllers: [HealthController],
})
export class AppModule {}
