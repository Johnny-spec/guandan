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

export interface Spectator {
  userId: string;
  displayName: string;
}

export interface Room {
  id: string;
  hostUserId: string;
  visibility: RoomVisibility;
  members: Map<string, Member>;
  /** 观战者（不参与出牌，仅接收公开广播 + room:updated）。 */
  spectators: Map<string, Spectator>;
  /** 裁判禁言的用户 ID 集合（保留至房间销毁；Phase 4 聊天上线后用于网关侧拦截）。 */
  mutedUsers: Set<string>;
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
  /** userId → roomId，观战所在房间（与 userRoom 互斥：玩家不能同时观战）。 */
  private readonly spectatorRoom = new Map<string, string>();

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
      spectators: new Map(),
      mutedUsers: new Set(),
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
    if (room.members.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`room ${roomId} disposed (empty)`);
      return { ok: true, room: null };
    }
    if (room.hostUserId === userId) {
      // 房主离开 → 顺位让位给下一名成员（若已无成员、仅剩观战者，则保留原 hostUserId 占位）
      const next = [...room.members.values()][0];
      if (next) room.hostUserId = next.userId;
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

  // ---- 裁判 (referee) 强制操作 ----

  /**
   * 裁判踢人：无视 host 权限直接移除成员。
   * 与 leaveRoom 区别：不要求是被踢者本人发起。
   * 返回 (a) 是否真的踢出了某人；(b) 更新后的 RoomDetail（房间已空则 null）。
   */
  kickMember(
    roomId: string,
    targetUserId: string,
  ): { ok: true; room: RoomDetail | null; kicked: boolean } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (!room.members.has(targetUserId)) {
      return { ok: false, code: 'NOT_IN_ROOM', message: targetUserId };
    }
    room.members.delete(targetUserId);
    this.userRoom.delete(targetUserId);
    // 房主被踢 → 顺位让位（与 leaveRoom 一致）
    if (room.hostUserId === targetUserId) {
      const next = [...room.members.values()][0];
      if (next) room.hostUserId = next.userId;
    }
    if (room.members.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`room ${roomId} disposed (kick last member)`);
      return { ok: true, room: null, kicked: true };
    }
    this.logger.log(`[referee] kick ${targetUserId} from ${roomId}`);
    return { ok: true, room: this.toDetail(room), kicked: true };
  }

  /** 裁判强结：清掉当前 session（房间保留，回到 idle）。 */
  forceEndSession(
    roomId: string,
  ): { ok: true; room: RoomDetail; hadSession: boolean } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    const hadSession = room.session !== null;
    room.session = null;
    if (hadSession) this.logger.log(`[referee] force-end session of ${roomId}`);
    return { ok: true, room: this.toDetail(room), hadSession };
  }

  /**
   * 裁判禁言：目标必须在 room.members 中（spectator 禁言留待 Phase 4）。
   * 幂等：重复禁言返回 changed=false。
   */
  muteMember(
    roomId: string,
    targetUserId: string,
  ): { ok: true; room: RoomDetail; changed: boolean } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (!room.members.has(targetUserId)) {
      return { ok: false, code: 'NOT_IN_ROOM', message: targetUserId };
    }
    const changed = !room.mutedUsers.has(targetUserId);
    if (changed) {
      room.mutedUsers.add(targetUserId);
      this.logger.log(`[referee] mute ${targetUserId} in ${roomId}`);
    }
    return { ok: true, room: this.toDetail(room), changed };
  }

  /** 裁判解除禁言：幂等。未禁言者返回 changed=false。 */
  unmuteMember(
    roomId: string,
    targetUserId: string,
  ): { ok: true; room: RoomDetail; changed: boolean } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    const changed = room.mutedUsers.delete(targetUserId);
    if (changed) this.logger.log(`[referee] unmute ${targetUserId} in ${roomId}`);
    return { ok: true, room: this.toDetail(room), changed };
  }

  /** 网关聊天 / 互动事件前置校验。 */
  isMuted(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    return room ? room.mutedUsers.has(userId) : false;
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
      spectatorIds: [...room.spectators.keys()],
      level: room.level,
      phase: room.session ? 'playing' : 'idle',
      createdAt: room.createdAt,
    };
  }

  // -------------------------- 观战 spectator API --------------------------

  /** 添加观战者：用户不可同时是玩家 / 已在其它房间观战。 */
  addSpectator(
    roomId: string,
    userId: string,
    displayName: string,
  ): { ok: true; room: RoomDetail } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (this.userRoom.get(userId)) {
      return { ok: false, code: 'ALREADY_IN_ROOM', message: 'leave current room first' };
    }
    const existing = this.spectatorRoom.get(userId);
    if (existing && existing !== roomId) {
      return { ok: false, code: 'ALREADY_SPECTATING', message: existing };
    }
    if (!room.spectators.has(userId)) {
      room.spectators.set(userId, { userId, displayName });
      this.spectatorRoom.set(userId, roomId);
      this.logger.log(`spectator ${userId} joined ${roomId}`);
    }
    return { ok: true, room: this.toDetail(room) };
  }

  /** 移除观战者（幂等）。返回更新后 RoomDetail；若房间已空且无成员，会清理房间。 */
  removeSpectator(
    roomId: string,
    userId: string,
  ): { ok: true; room: RoomDetail | null } | DomainError {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: roomId };
    if (!room.spectators.has(userId)) {
      // 幂等：不报错
      return { ok: true, room: this.toDetail(room) };
    }
    room.spectators.delete(userId);
    if (this.spectatorRoom.get(userId) === roomId) this.spectatorRoom.delete(userId);
    if (room.members.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`room ${roomId} disposed (empty after spectator leave)`);
      return { ok: true, room: null };
    }
    return { ok: true, room: this.toDetail(room) };
  }

  /** 用户断线时调用：若是观战者则移除并返回房间信息。 */
  detachSpectator(
    userId: string,
  ): { roomId: string; room: RoomDetail | null } | null {
    const roomId = this.spectatorRoom.get(userId);
    if (!roomId) return null;
    const r = this.removeSpectator(roomId, userId);
    if (!r.ok) return null;
    return { roomId, room: r.room };
  }

  isSpectator(roomId: string, userId: string): boolean {
    return this.rooms.get(roomId)?.spectators.has(userId) ?? false;
  }

  getSpectatorRoom(userId: string): Room | null {
    const id = this.spectatorRoom.get(userId);
    return id ? (this.rooms.get(id) ?? null) : null;
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
