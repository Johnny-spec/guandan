import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ReplayService } from './replay.service.js';

@Controller('api/v1')
export class ReplayController {
  constructor(@Inject(ReplayService) private readonly replay: ReplayService) {}

  @Get('matches/:id/replay')
  getReplay(@Param('id') id: string) {
    return {
      ok: true,
      data: {
        meta: this.replay.meta(id),
        events: this.replay.list(id),
      },
    };
  }
}
