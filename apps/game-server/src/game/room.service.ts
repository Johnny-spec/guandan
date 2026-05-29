import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  GameLevel,
  PlayerSnapshot,
  RoomDetail,
  RoomSummary,
  RoomVisibility,
  Seat,
} from '@teams-guandan/shared-types';
import { GameSession } from './game.session.js';

const SEAT_ORDER: readonly Seat[] = ['N', 'E', 'S', 'W'] as const;

export interface Member {
  userId: string;
  displayName: string;
  seat: Seat;
  isOffline: boolean;
  isBot: boolean;
  botDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface Room {
  id: string;
  hostUserId: string;
  visibility: RoomVisibility;
  members: Map<string, Member>;
  level: GameLevel;
  createdAt: string;
  session: GameSession | null;
}

export interface DomainError {
  ok: false;
  code: string;
  message: string;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private readonly rooms = new Map<string, Room>();
  /** userId → roomId，用于断线重连快速定位。 */
  private readonly userRoom = new Map<string, string>();

  createRoom(
    hostUserId: string,
    hostDisplayName: string,
    visibility: RoomVisibility,
  ): { ok: true; room: RoomSummary } | DomainError {
    if (this.userRoom.has(hostUserId)) {
      return { ok: false, code: 'ALREADY_IN_ROOM', message: 'leave current room first' };
    }
    const id = randomUUID().slice(0, 8);
    const room: Room = {
      id,
      hostUserId,
      visibility,
      members: new Map(),
      level: '2',
      createdAt: new Date().toISOString(),
      session: null,
    };
    room.members.set(hostUserId, {
      userId: hostUserId,
      displayName: hostDisplayName,
      seat: 'N',
      isOffline: false,
      isBot: false,
    });
    this.rooms.set(id, room);
    this.userRoom.set(hostUserId, id);
    this.logger.log(`room created ${id} by ${hostUserId}`);
    return { ok: true, room: this.toSummary(room) };
  }

  joinRoom(
    roomId: string,
    userId: string,
    displayName: string,
  ): { ok: true; room: RoomDetail } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };

    // 已在房 → 视为重连，刷新在线状态
    const existing = room.members.get(userId);
    if (existing) {
      existing.isOffline = false;
      this.userRoom.set(userId, roomId);
      return { ok: true, room: this.toDetail(room) };
    }

    if (this.userRoom.has(userId)) {
      return { ok: false, code: 'ALREADY_IN_ROOM', message: 'leave current room first' };
    }
    if (room.members.size >= 4) {
      return { ok: false, code: 'ROOM_FULL', message: roomId };
    }

    const used = new Set([...room.members.values()].map((m) => m.seat));
    const seat = SEAT_ORDER.find((s) => !used.has(s))!;
    room.members.set(userId, { userId, displayName, seat, isOffline: false, isBot: false });
    this.userRoom.set(userId, roomId);
    return { ok: true, room: this.toDetail(room) };
  }

  leaveRoom(roomId: string, userId: string): { ok: true; room: RoomDetail | null } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (!room.members.has(userId))
      return { ok: false, code: 'NOT_IN_ROOM', message: userId };
    room.members.delete(userId);
    this.userRoom.delete(userId);
    if (room.members.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`room ${roomId} disposed (empty)`);
      return { ok: true, room: null };
    }
    if (room.hostUserId === userId) {
      // 房主离开 → 顺位让位给下一名成员
      const next = [...room.members.values()][0]!;
      room.hostUserId = next.userId;
    }
    return { ok: true, room: this.toDetail(room) };
  }

  markOffline(userId: string): { roomId: string; room: RoomDetail } | null {
    const roomId = this.userRoom.get(userId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const m = room.members.get(userId);
    if (!m) return null;
    if (m.isBot) return null;
    m.isOffline = true;
    return { roomId, room: this.toDetail(room) };
  }

  /** Host 添加 AI Bot 到任意空位。 */
  addBot(
    roomId: string,
    hostUserId: string,
    difficulty: 'easy' | 'normal' | 'hard',
  ): { ok: true; room: RoomDetail; botUserId: string } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (room.hostUserId !== hostUserId)
      return { ok: false, code: 'NOT_HOST', message: 'only host can add bot' };
    if (room.session)
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'cannot add bot mid-game' };
    if (room.members.size >= 4)
      return { ok: false, code: 'ROOM_FULL', message: roomId };

    const used = new Set([...room.members.values()].map((m) => m.seat));
    const seat = SEAT_ORDER.find((s) => !used.has(s))!;
    const botUserId = `bot-${randomUUID().slice(0, 6)}`;
    const labelMap = { easy: '简单', normal: '普通', hard: '困难' };
    const displayName = `🤖 ${labelMap[difficulty]}Bot`;
    room.members.set(botUserId, {
      userId: botUserId,
      displayName,
      seat,
      isOffline: false,
      isBot: true,
      botDifficulty: difficulty,
    });
    // 故意不写 userRoom — bot 没有 socket，避免占用人类 userId 命名空间
    this.logger.log(`bot ${botUserId} (${difficulty}) added to ${roomId} seat=${seat}`);
    return { ok: true, room: this.toDetail(room), botUserId };
  }

  /** Host 移除 Bot；不能在开局后移除。 */
  removeBot(
    roomId: string,
    hostUserId: string,
    botUserId: string,
  ): { ok: true; room: RoomDetail } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (room.hostUserId !== hostUserId)
      return { ok: false, code: 'NOT_HOST', message: 'only host can remove bot' };
    if (room.session)
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'cannot remove bot mid-game' };
    const m = room.members.get(botUserId);
    if (!m) return { ok: false, code: 'NOT_IN_ROOM', message: botUserId };
    if (!m.isBot) return { ok: false, code: 'NOT_A_BOT', message: botUserId };
    room.members.delete(botUserId);
    return { ok: true, room: this.toDetail(room) };
  }

  /** seat → member（含 bot），供 BotService / Gateway 反查。 */
  memberAtSeat(room: Room, seat: Seat): Member | null {
    for (const m of room.members.values()) if (m.seat === seat) return m;
    return null;
  }

  /** Host 开局：必须 4 人、未开局。 */
  startGame(
    roomId: string,
    userId: string,
    rng?: () => number,
  ): { ok: true; room: RoomDetail } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (room.hostUserId !== userId)
      return { ok: false, code: 'NOT_HOST', message: 'only host can start' };
    if (room.members.size !== 4)
      return { ok: false, code: 'NOT_ENOUGH_PLAYERS', message: `${room.members.size}/4` };
    if (room.session)
      return { ok: false, code: 'GAME_NOT_STARTED', message: 'already started' };
    const seatToUser = new Map<Seat, string>();
    for (const m of room.members.values()) seatToUser.set(m.seat, m.userId);
    room.session = new GameSession(room.id, room.level, seatToUser, rng);
    return { ok: true, room: this.toDetail(room) };
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  getRoomForUser(userId: string): Room | null {
    const id = this.userRoom.get(userId);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  // ---- DTO 映射 ----

  toSummary(room: Room): RoomSummary {
    const seats: Partial<Record<Seat, string | null>> = {};
    for (const s of SEAT_ORDER) seats[s] = null;
    for (const m of room.members.values()) seats[m.seat] = m.userId;
    return {
      id: room.id,
      hostUserId: room.hostUserId,
      visibility: room.visibility,
      seats,
      spectatorIds: [],
      level: room.level,
      phase: room.session ? 'playing' : 'idle',
      createdAt: room.createdAt,
    };
  }

  toDetail(room: Room): RoomDetail {
    const players: PlayerSnapshot[] = [...room.members.values()].map((m) => ({
      userId: m.userId,
      seat: m.seat,
      handCount: room.session ? room.session.handCount(m.seat) : 0,
      isOffline: m.isOffline,
      isAuto: false,
      isBot: m.isBot,
      ...(m.botDifficulty ? { botDifficulty: m.botDifficulty } : {}),
    }));
    return { ...this.toSummary(room), players };
  }
}
