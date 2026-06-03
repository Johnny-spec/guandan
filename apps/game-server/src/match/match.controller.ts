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
  listMatches(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('completedOnly') completedOnly?: string,
  ) {
    if (!userId) {
      return { ok: false, code: 'BAD_REQUEST', message: 'userId required' };
    }
    const n = limit ? Number(limit) : 20;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, code: 'BAD_REQUEST', message: 'limit must be > 0' };
    }
    // 翻页路径：当任何分页/筛选参数出现时返回 page 形态
    if (cursor || since || until || completedOnly) {
      const page = this.svc.queryMatchesByUser(userId, {
        limit: n,
        cursor: cursor ?? null,
        since: since ?? null,
        until: until ?? null,
        completedOnly: completedOnly === 'true' || completedOnly === '1',
      });
      return { ok: true, data: page };
    }
    // 旧路径：兼容 v1 客户端，返回数组
    return { ok: true, data: this.svc.listMatchesByUser(userId, n) };
  }

  @Get('users/:id/rank')
  rank(@Param('id') id: string) {
    const r = this.svc.getUserRank(id);
    if (!r) throw new NotFoundException({ ok: false, code: 'USER_NOT_FOUND', message: id });
    return { ok: true, data: r };
  }

  @Get('users/:id/rating-events')
  ratingEvents(@Param('id') id: string, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, code: 'BAD_REQUEST', message: 'limit must be > 0' };
    }
    return { ok: true, data: this.svc.listRatingEventsByUser(id, n) };
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
