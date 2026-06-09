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
  GuildActivityError,
  GuildActivityService,
  type CreateChannelInput,
  type CreateEventInput,
} from './guild-activity.service.js';
import type {
  GuildEventRsvpStatus,
  GuildEventStatus,
} from './guild-activity.repository.js';

function wrap<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (err) {
    if (err instanceof GuildActivityError) {
      throw new HttpException({ ok: false, code: err.code, message: err.message }, err.status);
    }
    throw err;
  }
}

interface RequesterAware {
  requesterId: string;
}

@Controller('api/v1/guilds/:guildId')
export class GuildActivityController {
  constructor(@Inject(GuildActivityService) private readonly svc: GuildActivityService) {}

  @Get('channels')
  listChannels(@Param('guildId') guildId: string, @Query('requesterId') requesterId: string) {
    return wrap(() => this.svc.listChannels(guildId, requesterId));
  }

  @Post('channels')
  createChannel(
    @Param('guildId') guildId: string,
    @Body() body: CreateChannelInput & RequesterAware,
  ) {
    return wrap(() => this.svc.createChannel(guildId, body.requesterId, body));
  }

  @Get('events')
  listEvents(
    @Param('guildId') guildId: string,
    @Query('requesterId') requesterId: string,
    @Query('status') status?: string,
  ) {
    return wrap(() =>
      this.svc.listEvents(guildId, requesterId, {
        status: status ? (status as GuildEventStatus) : undefined,
      }),
    );
  }

  @Post('events')
  createEvent(
    @Param('guildId') guildId: string,
    @Body() body: CreateEventInput & RequesterAware,
  ) {
    return wrap(() => this.svc.createEvent(guildId, body.requesterId, body));
  }
}

@Controller('api/v1/guild-channels')
export class GuildChannelController {
  constructor(@Inject(GuildActivityService) private readonly svc: GuildActivityService) {}

  @Post(':channelId/archive')
  archive(@Param('channelId') channelId: string, @Body() body: RequesterAware) {
    return wrap(() => this.svc.archiveChannel(channelId, body.requesterId));
  }
}

@Controller('api/v1/guild-events')
export class GuildEventController {
  constructor(@Inject(GuildActivityService) private readonly svc: GuildActivityService) {}

  @Post(':eventId/cancel')
  cancel(@Param('eventId') eventId: string, @Body() body: RequesterAware) {
    return wrap(() => this.svc.cancelEvent(eventId, body.requesterId));
  }

  @Post(':eventId/rsvp')
  rsvp(
    @Param('eventId') eventId: string,
    @Body() body: RequesterAware & { status: GuildEventRsvpStatus },
  ) {
    return wrap(() => this.svc.rsvpEvent(eventId, body.requesterId, body.status));
  }

  @Get(':eventId/rsvps')
  listRsvps(
    @Param('eventId') eventId: string,
    @Query('requesterId') requesterId: string,
    @Query('status') status?: string,
  ) {
    return wrap(() =>
      this.svc.listRsvps(eventId, requesterId, {
        status: status ? (status as GuildEventRsvpStatus) : undefined,
      }),
    );
  }
}
