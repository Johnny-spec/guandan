import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  GuildError,
  GuildService,
  type CreateGuildInput,
  type UpdateGuildInput,
} from './guild.service.js';
import type { GuildMembershipStatus, GuildRole } from './guild.repository.js';

function wrap<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (err) {
    if (err instanceof GuildError) {
      throw new HttpException({ ok: false, code: err.code, message: err.message }, err.status);
    }
    throw err;
  }
}

@Controller('api/v1/guilds')
export class GuildController {
  constructor(@Inject(GuildService) private readonly svc: GuildService) {}

  @Get()
  list(
    @Query('tenantId') tenantId?: string,
    @Query('includeDisbanded') includeDisbanded?: string,
  ) {
    return wrap(() =>
      this.svc.listGuilds({
        tenantId: tenantId || undefined,
        includeDisbanded: includeDisbanded === 'true',
      }),
    );
  }

  @Post()
  create(@Body() body: CreateGuildInput) {
    return wrap(() => this.svc.createGuild(body));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return wrap(() => this.svc.getGuild(id));
  }

  @Post(':id/update')
  update(@Param('id') id: string, @Body() body: UpdateGuildInput) {
    return wrap(() => this.svc.updateGuild(id, body));
  }

  @Post(':id/disband')
  disband(@Param('id') id: string, @Body() body: { byUserId: string }) {
    return wrap(() => this.svc.disbandGuild(id, body.byUserId));
  }

  @Get(':id/memberships')
  listMembers(@Param('id') id: string, @Query('status') status?: string) {
    return wrap(() =>
      this.svc.listMemberships(id, {
        status: status ? (status as GuildMembershipStatus) : undefined,
      }),
    );
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Body() body: { userId: string }) {
    return wrap(() => this.svc.requestJoin(id, body.userId));
  }

  @Post(':id/invite')
  invite(
    @Param('id') id: string,
    @Body() body: { byUserId: string; userId: string },
  ) {
    return wrap(() => this.svc.inviteMember(id, body.byUserId, body.userId));
  }

  @Post(':id/leave')
  leave(@Param('id') id: string, @Body() body: { userId: string }) {
    return wrap(() => this.svc.leaveGuild(id, body.userId));
  }
}

@Controller('api/v1/guild-memberships')
export class GuildMembershipController {
  constructor(@Inject(GuildService) private readonly svc: GuildService) {}

  @Post(':membershipId/approve')
  approve(
    @Param('membershipId') membershipId: string,
    @Body() body: { guildId: string; byUserId: string },
  ) {
    return wrap(() => this.svc.approveMembership(body.guildId, body.byUserId, membershipId));
  }

  @Post(':membershipId/kick')
  kick(
    @Param('membershipId') membershipId: string,
    @Body() body: { guildId: string; byUserId: string },
  ) {
    return wrap(() => this.svc.kickMember(body.guildId, body.byUserId, membershipId));
  }

  @Post(':membershipId/promote')
  promote(
    @Param('membershipId') membershipId: string,
    @Body() body: { guildId: string; byUserId: string; role: GuildRole },
  ) {
    return wrap(() =>
      this.svc.promoteMember(body.guildId, body.byUserId, membershipId, body.role),
    );
  }
}
