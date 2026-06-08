import { Module } from '@nestjs/common';
import { GUILD_REPOSITORY, InMemoryGuildRepository } from './guild.repository.js';
import { GuildService } from './guild.service.js';
import { GuildController, GuildMembershipController } from './guild.controller.js';

@Module({
  providers: [
    InMemoryGuildRepository,
    { provide: GUILD_REPOSITORY, useExisting: InMemoryGuildRepository },
    GuildService,
  ],
  controllers: [GuildController, GuildMembershipController],
  exports: [GUILD_REPOSITORY, GuildService],
})
export class GuildModule {}
