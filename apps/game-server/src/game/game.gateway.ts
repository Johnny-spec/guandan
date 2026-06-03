import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import type { Namespace, Server, Socket } from 'socket.io';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@teams-guandan/socket-protocol';
import { ERROR_CODES } from '@teams-guandan/socket-protocol';
import type {
  GameStateSnapshot,
  RoomDetail,
  RoomSummary,
} from '@teams-guandan/shared-types';
import { AuthService, type AuthenticatedUser } from '../auth/auth.service.js';
import { RoomService, type Room } from './room.service.js';
import { BotService, type BotTurnOutcome } from '../ai/bot.service.js';
import { MatchService, type MatchSeat } from '../match/match.service.js';
import { ReplayService } from '../replay/replay.service.js';

type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;
type Srv = Server<ClientToServerEvents, ServerToClientEvents>;

function err(code: string, message: string): AckResult<never> {
  return { ok: false, code, message };
}

@WebSocketGateway({ namespace: '/game', cors: true })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Srv;

  /** userId → socketId（最近一次连接），用于私播。 */
  private readonly userSocket = new Map<string, string>();

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RoomService) private readonly rooms: RoomService,
    @Inject(BotService) private readonly bots: BotService,
    @Inject(MatchService) private readonly matches: MatchService,
    @Inject(ReplayService) private readonly replay: ReplayService,
  ) {}

  afterInit(server: Srv) {
    const auth = this.auth;
    server.use((socket, next) => {
      const raw = socket.handshake.auth?.['token'] as string | undefined;
      const user = auth.verify(raw);
      if (!user) return next(new Error(ERROR_CODES.UNAUTHORIZED));
      (socket.data as { user: AuthenticatedUser }).user = user;
      next();
    });
    this.logger.log('GameGateway namespace=/game initialized');
  }

  handleConnection(client: Sock) {
    const user = (client.data as { user: AuthenticatedUser }).user;
    this.userSocket.set(user.userId, client.id);
    // 让人类账号在登录时就出现在战绩仓储里（带最新 displayName）
    this.matches.upsertHuman(user.userId, user.displayName);
    this.logger.log(`[connect] ${user.userId} sock=${client.id}`);

    // 重连：若已在某房间，自动 join socket.io room 并推私有快照
    const room = this.rooms.getRoomForUser(user.userId);
    if (room) {
      void client.join(room.id);
      const detail = this.rooms.toDetail(room);
      client.emit('room:updated', detail);
      if (room.session) this.emitPrivateSnapshot(client, room, detail);
    }
  }

  handleDisconnect(client: Sock) {
    const user = (client.data as { user?: AuthenticatedUser }).user;
    if (!user) return;
    if (this.userSocket.get(user.userId) === client.id) {
      this.userSocket.delete(user.userId);
    }
    const res = this.rooms.markOffline(user.userId);
    if (res) {
      this.server.to(res.roomId).emit('room:updated', res.room);
    }
    this.logger.log(`[disconnect] ${user.userId}`);
  }

  // -------------------------------------------------------------------------
  // 命令处理
  // -------------------------------------------------------------------------

  @SubscribeMessage('room:create')
  async onCreate(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { visibility: 'public' | 'private' },
  ): Promise<AckResult<RoomSummary>> {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.createRoom(user.userId, user.displayName, body.visibility);
    if (!r.ok) return err(r.code, r.message);
    await client.join(r.room.id);
    const detail = this.rooms.toDetail(this.rooms.getRoom(r.room.id)!);
    this.server.to(r.room.id).emit('room:updated', detail);
    return { ok: true, data: r.room };
  }

  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string },
  ): Promise<AckResult<RoomDetail>> {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.joinRoom(body.roomId, user.userId, user.displayName);
    if (!r.ok) return err(r.code, r.message);
    await client.join(body.roomId);
    this.server.to(body.roomId).emit('room:updated', r.room);
    const room = this.rooms.getRoom(body.roomId);
    if (room?.session) this.emitPrivateSnapshot(client, room, r.room);
    return { ok: true, data: r.room };
  }

  @SubscribeMessage('room:leave')
  async onLeave(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string },
  ): Promise<AckResult> {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.leaveRoom(body.roomId, user.userId);
    if (!r.ok) return err(r.code, r.message);
    await client.leave(body.roomId);
    if (r.room) this.server.to(body.roomId).emit('room:updated', r.room);
    return { ok: true, data: undefined };
  }

  @SubscribeMessage('game:start')
  onStart(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string },
  ): AckResult {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.startGame(body.roomId, user.userId);
    if (!r.ok) return err(r.code, r.message);
    const room = this.rooms.getRoom(body.roomId)!;
    const seats: MatchSeat[] = [...room.members.values()].map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      seat: m.seat,
      isBot: m.isBot,
      ...(m.botDifficulty ? { botDifficulty: m.botDifficulty } : {}),
    }));
    this.matches.onStart(body.roomId, room.level, seats);
    const matchId = this.matches.getActiveMatchId(body.roomId);
    if (matchId) {
      this.replay.recordMatchStart(matchId, {
        roomId: body.roomId,
        startLevel: room.level,
        seats: seats.map((s) => ({
          userId: s.userId,
          displayName: s.displayName,
          seat: s.seat,
          isBot: s.isBot,
        })),
      });
    }
    this.server.to(body.roomId).emit('room:updated', r.room);
    this.broadcastPrivateSnapshots(body.roomId);
    this.scheduleBot(body.roomId);
    return { ok: true, data: undefined };
  }

  @SubscribeMessage('bot:add')
  onBotAdd(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string; difficulty: 'easy' | 'normal' | 'hard' },
  ): AckResult<RoomDetail> {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.addBot(body.roomId, user.userId, body.difficulty);
    if (!r.ok) return err(r.code, r.message);
    this.server.to(body.roomId).emit('room:updated', r.room);
    return { ok: true, data: r.room };
  }

  @SubscribeMessage('bot:remove')
  onBotRemove(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string; botUserId: string },
  ): AckResult<RoomDetail> {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const r = this.rooms.removeBot(body.roomId, user.userId, body.botUserId);
    if (!r.ok) return err(r.code, r.message);
    this.server.to(body.roomId).emit('room:updated', r.room);
    return { ok: true, data: r.room };
  }

  @SubscribeMessage('game:play')
  onPlay(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string; cardIds: string[] },
  ): AckResult {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const room = this.rooms.getRoom(body.roomId);
    if (!room) return err(ERROR_CODES.ROOM_NOT_FOUND, body.roomId);
    if (!room.session) return err(ERROR_CODES.GAME_NOT_STARTED, body.roomId);
    const seat = room.session.seatForUser(user.userId);
    if (!seat) return err(ERROR_CODES.NOT_IN_ROOM, user.userId);

    const r = room.session.play(seat, body.cardIds);
    if (!r.ok) return err(r.code, r.message);

    this.server.to(body.roomId).emit('game:played', { seat, cardIds: body.cardIds });
    const playMatchId = this.matches.getActiveMatchId(body.roomId);
    if (playMatchId) this.replay.recordPlay(playMatchId, { seat, cardIds: body.cardIds });
    const detail = this.rooms.toDetail(room);
    this.server.to(body.roomId).emit('room:updated', detail);
    this.broadcastPrivateSnapshots(body.roomId);

    if (r.finished && r.winnerTeam) {
      const finishMatchId = this.matches.getActiveMatchId(body.roomId);
      const startedAtMs = Date.now();
      const finishedRec = this.matches.onFinish(body.roomId, r.winnerTeam, [seat], room.level);
      if (finishMatchId) {
        this.replay.recordMatchFinish(finishMatchId, {
          winnerTeam: r.winnerTeam,
          finishedOrder: [seat],
          endLevel: room.level,
          durationMs: finishedRec?.durationMs ?? Date.now() - startedAtMs,
        });
      }
      this.server.to(body.roomId).emit('game:finished', {
        winnerTeam: r.winnerTeam,
        finishedOrder: [seat],
        nextLevel: room.level,
      });
      this.bots.cancel(body.roomId);
    } else {
      this.scheduleBot(body.roomId);
    }
    return { ok: true, data: undefined };
  }

  @SubscribeMessage('game:pass')
  onPass(
    @ConnectedSocket() client: Sock,
    @MessageBody() body: { roomId: string },
  ): AckResult {
    const user = (client.data as { user: AuthenticatedUser }).user;
    const room = this.rooms.getRoom(body.roomId);
    if (!room) return err(ERROR_CODES.ROOM_NOT_FOUND, body.roomId);
    if (!room.session) return err(ERROR_CODES.GAME_NOT_STARTED, body.roomId);
    const seat = room.session.seatForUser(user.userId);
    if (!seat) return err(ERROR_CODES.NOT_IN_ROOM, user.userId);

    const r = room.session.pass(seat);
    if (!r.ok) return err(r.code, r.message);

    this.server.to(body.roomId).emit('game:passed', { seat });
    const passMatchId = this.matches.getActiveMatchId(body.roomId);
    if (passMatchId) this.replay.recordPass(passMatchId, { seat });
    if (r.trickClosed && r.nextLead) {
      this.server.to(body.roomId).emit('game:trick-closed', { lead: r.nextLead });
      if (passMatchId) this.replay.recordTrickClosed(passMatchId, { lead: r.nextLead });
    }
    this.broadcastPrivateSnapshots(body.roomId);
    this.scheduleBot(body.roomId);
    return { ok: true, data: undefined };
  }

  @SubscribeMessage('ping')
  onPing(): number {
    return Date.now();
  }

  // -------------------------------------------------------------------------
  // 私有快照分发
  // -------------------------------------------------------------------------

  private broadcastPrivateSnapshots(roomId: string) {
    const room = this.rooms.getRoom(roomId);
    if (!room || !room.session) return;
    const detail = this.rooms.toDetail(room);
    const nsp = this.server as unknown as Namespace<ClientToServerEvents, ServerToClientEvents>;
    for (const m of room.members.values()) {
      const sockId = this.userSocket.get(m.userId);
      if (!sockId) continue;
      const sock = nsp.sockets.get(sockId) as Sock | undefined;
      if (!sock) continue;
      this.emitPrivateSnapshot(sock, room, detail);
    }
  }

  private emitPrivateSnapshot(client: Sock, room: Room, detail: RoomDetail) {
    if (!room.session) return;
    const user = (client.data as { user: AuthenticatedUser }).user;
    const snap: GameStateSnapshot = room.session.snapshotFor(user.userId, detail.players);
    client.emit('game:state', snap);
  }

  /**
   * 调度 bot 出牌：若当前回合为 bot 控制，BOT_DELAY_MS 后执行决策并广播；
   * 然后递归 schedule（仍是 setTimeout 链，不会爆栈）。
   */
  private scheduleBot(roomId: string): void {
    const room = this.rooms.getRoom(roomId);
    if (!room) return;
    this.bots.schedule(room, (outcome) => this.applyBotOutcome(roomId, outcome));
  }

  private applyBotOutcome(roomId: string, outcome: BotTurnOutcome): void {
    if (outcome.kind === 'no-bot' || outcome.kind === 'error') return;
    const room = this.rooms.getRoom(roomId);
    if (!room || !room.session) return;
    const detail = this.rooms.toDetail(room);

    if (outcome.kind === 'play') {
      this.server.to(roomId).emit('game:played', {
        seat: outcome.seat,
        cardIds: outcome.cardIds,
      });
      const playMatchId = this.matches.getActiveMatchId(roomId);
      if (playMatchId) this.replay.recordPlay(playMatchId, { seat: outcome.seat, cardIds: outcome.cardIds });
      this.server.to(roomId).emit('room:updated', detail);
      this.broadcastPrivateSnapshots(roomId);
      if (outcome.result.finished && outcome.result.winnerTeam) {
        const finishMatchId = this.matches.getActiveMatchId(roomId);
        const startedAtMs = Date.now();
        const finishedRec = this.matches.onFinish(roomId, outcome.result.winnerTeam, [outcome.seat], room.level);
        if (finishMatchId) {
          this.replay.recordMatchFinish(finishMatchId, {
            winnerTeam: outcome.result.winnerTeam,
            finishedOrder: [outcome.seat],
            endLevel: room.level,
            durationMs: finishedRec?.durationMs ?? Date.now() - startedAtMs,
          });
        }
        this.server.to(roomId).emit('game:finished', {
          winnerTeam: outcome.result.winnerTeam,
          finishedOrder: [outcome.seat],
          nextLevel: room.level,
        });
        this.bots.cancel(roomId);
        return;
      }
    } else {
      this.server.to(roomId).emit('game:passed', { seat: outcome.seat });
      const passMatchId = this.matches.getActiveMatchId(roomId);
      if (passMatchId) this.replay.recordPass(passMatchId, { seat: outcome.seat });
      if (outcome.result.trickClosed && outcome.result.nextLead) {
        this.server.to(roomId).emit('game:trick-closed', { lead: outcome.result.nextLead });
        if (passMatchId) this.replay.recordTrickClosed(passMatchId, { lead: outcome.result.nextLead });
      }
      this.broadcastPrivateSnapshots(roomId);
    }
    // 链式调度下一步
    this.scheduleBot(roomId);
  }
}
