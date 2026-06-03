import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { MatchService } from './match.service.js';

@Controller('api/v1')
export class MatchController {
  constructor(@Inject(MatchService) private readonly svc: MatchService) {}

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    const u = this.svc.getUserView(id);
    if (!u) throw new NotFoundException({ ok: false, code: 'USER_NOT_FOUND', message: id });
    return { ok: true, data: u };
  }

  @Get('matches')
  listMatches(@Query('userId') userId: string, @Query('limit') limit?: string) {
    if (!userId) {
      return { ok: false, code: 'BAD_REQUEST', message: 'userId required' };
    }
    const n = limit ? Number(limit) : 20;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, code: 'BAD_REQUEST', message: 'limit must be > 0' };
    }
    return { ok: true, data: this.svc.listMatchesByUser(userId, n) };
  }

  @Get('leaderboard')
  leaderboard(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, code: 'BAD_REQUEST', message: 'limit must be > 0' };
    }
    return { ok: true, data: this.svc.listLeaderboard(n) };
  }
}
