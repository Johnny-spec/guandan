import { Module } from '@nestjs/common';
import { ReplayService } from './replay.service.js';
import { ReplayController } from './replay.controller.js';

@Module({
  providers: [ReplayService],
  controllers: [ReplayController],
  exports: [ReplayService],
})
export class ReplayModule {}
