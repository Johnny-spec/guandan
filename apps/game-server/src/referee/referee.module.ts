import { Module } from '@nestjs/common';
import { RefereeService } from './referee.service.js';
import { RefereeController } from './referee.controller.js';

@Module({
  providers: [RefereeService],
  controllers: [RefereeController],
  exports: [RefereeService],
})
export class RefereeModule {}
