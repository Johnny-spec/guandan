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
  TournamentError,
  TournamentService,
  type CreateTournamentInput,
  type RegisterEntryInput,
} from './tournament.service.js';
import type { EntryStatus, TournamentStatus } from './tournament.repository.js';

function wrap<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (err) {
    if (err instanceof TournamentError) {
      throw new HttpException({ ok: false, code: err.code, message: err.message }, err.status);
    }
    throw err;
  }
}

@Controller('api/v1/tournaments')
export class TournamentController {
  constructor(@Inject(TournamentService) private readonly svc: TournamentService) {}

  @Get()
  list(@Query('status') status?: string, @Query('hostUserId') hostUserId?: string) {
    return wrap(() =>
      this.svc.listTournaments({
        status: status ? (status as TournamentStatus) : undefined,
        hostUserId: hostUserId || undefined,
      }),
    );
  }

  @Post()
  create(@Body() body: CreateTournamentInput) {
    return wrap(() => this.svc.createTournament(body));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return wrap(() => this.svc.getTournament(id));
  }

  @Post(':id/open')
  open(@Param('id') id: string) {
    return wrap(() => this.svc.openRegistration(id));
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return wrap(() => this.svc.closeRegistration(id));
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return wrap(() => this.svc.startTournament(id));
  }

  @Post(':id/finish')
  finish(@Param('id') id: string) {
    return wrap(() => this.svc.finishTournament(id));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return wrap(() => this.svc.cancelTournament(id));
  }

  @Get(':id/entries')
  listEntries(@Param('id') id: string, @Query('status') status?: string) {
    return wrap(() =>
      this.svc.listEntries(id, {
        status: status ? (status as EntryStatus) : undefined,
      }),
    );
  }

  @Post(':id/entries')
  register(@Param('id') id: string, @Body() body: RegisterEntryInput) {
    return wrap(() => this.svc.registerEntry(id, body));
  }

  @Get(':id/bracket')
  bracket(@Param('id') id: string) {
    return wrap(() => this.svc.previewBracket(id));
  }

  @Get(':id/live-bracket')
  liveBracket(@Param('id') id: string) {
    return wrap(() => this.svc.getLiveBracket(id));
  }

  @Get(':id/live-bracket/matches/:matchId')
  getBracketMatch(@Param('id') id: string, @Param('matchId') matchId: string) {
    return wrap(() => this.svc.getBracketMatch(id, matchId));
  }

  @Post(':id/live-bracket/matches/:matchId/result')
  recordBracketMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: { winner: 'A' | 'B' },
  ) {
    return wrap(() => this.svc.recordBracketMatchResult(id, matchId, body?.winner));
  }
}

@Controller('api/v1/tournament-entries')
export class TournamentEntryController {
  constructor(@Inject(TournamentService) private readonly svc: TournamentService) {}

  @Post(':entryId/withdraw')
  withdraw(@Param('entryId') entryId: string) {
    return wrap(() => this.svc.updateEntryStatus(entryId, 'WITHDRAWN'));
  }

  @Post(':entryId/confirm')
  confirm(@Param('entryId') entryId: string) {
    return wrap(() => this.svc.updateEntryStatus(entryId, 'CONFIRMED'));
  }

  @Post(':entryId/kick')
  kick(@Param('entryId') entryId: string) {
    return wrap(() => this.svc.updateEntryStatus(entryId, 'KICKED'));
  }
}
