import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchModule } from '../match/match.module.js';
import { GameGateway } from './game.gateway.js';
import { RoomService } from './room.service.js';
import { BotService } from '../ai/bot.service.js';

@Module({
  imports: [AuthModule, MatchModule],
  providers: [GameGateway, RoomService, BotService],
  exports: [RoomService],
})
export class GameModule {}
