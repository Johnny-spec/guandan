import type {
  GameStateSnapshot,
  RoomDetail,
  RoomSummary,
  Seat,
} from '@teams-guandan/shared-types';

/** Ack 通用结果：成功带 data，失败带 code/message。 */
export type AckResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

/**
 * 客户端 → 服务端 事件。所有命令都带 ack 回调，
 * payload 必须可序列化且不含敏感字段。
 */
export interface ClientToServerEvents {
  'room:create': (
    payload: { visibility: 'public' | 'private' },
    ack: (res: AckResult<RoomSummary>) => void,
  ) => void;
  'room:join': (
    payload: { roomId: string },
    ack: (res: AckResult<RoomDetail>) => void,
  ) => void;
  'room:leave': (
    payload: { roomId: string },
    ack: (res: AckResult) => void,
  ) => void;
  'game:start': (
    payload: { roomId: string },
    ack: (res: AckResult) => void,
  ) => void;
  'game:play': (
    payload: { roomId: string; cardIds: string[] },
    ack: (res: AckResult) => void,
  ) => void;
  'game:pass': (
    payload: { roomId: string },
    ack: (res: AckResult) => void,
  ) => void;
  'bot:add': (
    payload: { roomId: string; difficulty: 'easy' | 'normal' | 'hard' },
    ack: (res: AckResult<RoomDetail>) => void,
  ) => void;
  'bot:remove': (
    payload: { roomId: string; botUserId: string },
    ack: (res: AckResult<RoomDetail>) => void,
  ) => void;
  'spectate:join': (
    payload: { roomId: string },
    ack: (res: AckResult<RoomDetail>) => void,
  ) => void;
  'spectate:leave': (
    payload: { roomId: string },
    ack: (res: AckResult) => void,
  ) => void;
  'referee:kick': (
    payload: { roomId: string; targetUserId: string; reason?: string },
    ack: (res: AckResult) => void,
  ) => void;
  'referee:force_end': (
    payload: { roomId: string; reason?: string },
    ack: (res: AckResult) => void,
  ) => void;
  'referee:warn': (
    payload: { roomId: string; targetUserId: string; reason?: string },
    ack: (res: AckResult) => void,
  ) => void;
  'referee:mute': (
    payload: { roomId: string; targetUserId: string; reason?: string },
    ack: (res: AckResult) => void,
  ) => void;
  'referee:unmute': (
    payload: { roomId: string; targetUserId: string; reason?: string },
    ack: (res: AckResult) => void,
  ) => void;
  'ping': (ack: (serverTime: number) => void) => void;
}

/** 服务端 → 客户端 广播 / 单播事件。 */
export interface ServerToClientEvents {
  'room:updated': (room: RoomDetail) => void;
  /** 私有快照（带自己的手牌），单播给单个 socket。 */
  'game:state': (snapshot: GameStateSnapshot) => void;
  /** 公开广播：某座位出了牌。 */
  'game:played': (payload: { seat: Seat; cardIds: string[] }) => void;
  /** 公开广播：某座位 Pass。 */
  'game:passed': (payload: { seat: Seat }) => void;
  /** 当前墩收牌（3 连 pass）。lead 为新墩开手座位。 */
  'game:trick-closed': (payload: { lead: Seat }) => void;
  /** 整局结束。winnerTeam 为先出完牌一方。 */
  'game:finished': (payload: {
    winnerTeam: 'NS' | 'EW';
    finishedOrder: Seat[];
    nextLevel: string;
  }) => void;
  'chat:message': (payload: { from: string; text: string; at: number }) => void;
  /** 裁判强制结束当前对局（房间状态回到 idle）。 */
  'game:aborted': (payload: { roomId: string; refereeUserId: string; reason?: string }) => void;
  /** 单播：被裁判踢出房间。 */
  'room:kicked': (payload: { roomId: string; refereeUserId: string; reason?: string }) => void;
  /** 广播：裁判产生了一次审计动作（前端可弹通知）。 */
  'referee:action': (payload: {
    id: number;
    roomId: string;
    refereeUserId: string;
    kind: 'warn' | 'mute' | 'unmute' | 'kick' | 'force_end' | 'note';
    targetUserId?: string;
    reason?: string;
    tsMs: number;
  }) => void;
  'error': (payload: { code: string; message: string }) => void;
}

/** Socket.IO 命名空间路径。 */
export const NAMESPACES = {
  GAME: '/game',
  SPECTATOR: '/spectate',
} as const;

/** 离散错误码。客户端可据此本地化文案。 */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  CANNOT_PASS: 'CANNOT_PASS',
  INVALID_PLAY: 'INVALID_PLAY',
  UNKNOWN_CARD: 'UNKNOWN_CARD',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_A_BOT: 'NOT_A_BOT',
  ALREADY_SPECTATING: 'ALREADY_SPECTATING',
  NOT_REFEREE: 'NOT_REFEREE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
