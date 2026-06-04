import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { RefereeService } from './referee.service.js';
import type { RefereeActionInput, RefereeActionKind, RefereeListFilter } from './referee.types.js';

interface CreateActionBody {
  refereeUserId: string;
  kind: RefereeActionKind;
  roomId: string;
  matchId?: string;
  targetUserId?: string;
  reason?: string;
}

@Controller('api/v1/referee')
export class RefereeController {
  constructor(@Inject(RefereeService) private readonly svc: RefereeService) {}

  // ---- 角色 ----

  @Get('roles')
  listRoles() {
    return { ok: true, data: { referees: this.svc.listReferees() } };
  }

  @Post('roles/:userId')
  assign(@Param('userId') userId: string) {
    if (!userId) return { ok: false, code: 'BAD_REQUEST', message: 'userId required' };
    const created = this.svc.assignReferee(userId);
    return { ok: true, data: { userId, created } };
  }

  @Delete('roles/:userId')
  revoke(@Param('userId') userId: string) {
    if (!userId) return { ok: false, code: 'BAD_REQUEST', message: 'userId required' };
    const removed = this.svc.revokeReferee(userId);
    return { ok: true, data: { userId, removed } };
  }

  // ---- 审计 ----

  @Post('actions')
  create(@Body() body: CreateActionBody) {
    if (!body?.refereeUserId || !body?.kind || !body?.roomId) {
      return { ok: false, code: 'BAD_REQUEST', message: 'refereeUserId/kind/roomId required' };
    }
    if (!this.svc.isReferee(body.refereeUserId)) {
      return { ok: false, code: 'NOT_REFEREE', message: body.refereeUserId };
    }
    try {
      const input: RefereeActionInput = {
        refereeUserId: body.refereeUserId,
        kind: body.kind,
        roomId: body.roomId,
        ...(body.matchId ? { matchId: body.matchId } : {}),
        ...(body.targetUserId ? { targetUserId: body.targetUserId } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
      };
      const action = this.svc.recordAction(input);
      return { ok: true, data: action };
    } catch (e) {
      return { ok: false, code: 'BAD_REQUEST', message: (e as Error).message };
    }
  }

  @Get('actions')
  list(
    @Query('roomId') roomId?: string,
    @Query('matchId') matchId?: string,
    @Query('refereeUserId') refereeUserId?: string,
    @Query('targetUserId') targetUserId?: string,
    @Query('kind') kind?: RefereeActionKind,
    @Query('sinceMs') sinceMs?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: RefereeListFilter = {
      ...(roomId ? { roomId } : {}),
      ...(matchId ? { matchId } : {}),
      ...(refereeUserId ? { refereeUserId } : {}),
      ...(targetUserId ? { targetUserId } : {}),
      ...(kind ? { kind } : {}),
      ...(sinceMs ? { sinceMs: Number(sinceMs) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    return { ok: true, data: this.svc.list(filter) };
  }
}
