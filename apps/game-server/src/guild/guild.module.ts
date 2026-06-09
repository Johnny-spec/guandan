import { Module } from '@nestjs/common';
import { GUILD_REPOSITORY, InMemoryGuildRepository } from './guild.repository.js';
import { GuildService } from './guild.service.js';
import { GuildController, GuildMembershipController } from './guild.controller.js';
import {
  GUILD_ACTIVITY_REPOSITORY,
  InMemoryGuildActivityRepository,
} from './guild-activity.repository.js';
import { GuildActivityService } from './guild-activity.service.js';
import {
  GuildActivityController,
  GuildChannelController,
  GuildEventController,
} from './guild-activity.controller.js';

@Module({
  providers: [
    InMemoryGuildRepository,
    { provide: GUILD_REPOSITORY, useExisting: InMemoryGuildRepository },
    GuildService,
    InMemoryGuildActivityRepository,
    { provide: GUILD_ACTIVITY_REPOSITORY, useExisting: InMemoryGuildActivityRepository },
    GuildActivityService,
  ],
  controllers: [
    GuildController,
    GuildMembershipController,
    GuildActivityController,
    GuildChannelController,
    GuildEventController,
  ],
  exports: [GUILD_REPOSITORY, GuildService, GUILD_ACTIVITY_REPOSITORY, GuildActivityService],
})
export class GuildModule {}
