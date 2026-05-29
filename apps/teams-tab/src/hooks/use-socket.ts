'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@teams-guandan/socket-protocol';
import { useAuthStore } from '../stores/auth';
import { useRoomStore } from '../stores/room';
import { GAME_SERVER_URL, makeDevToken } from '../lib/dev-token';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let singleton: GameSocket | null = null;
let connectedFor: string | null = null;

function ensureSocket(userId: string, displayName: string): GameSocket {
  if (singleton && connectedFor === userId) return singleton;
  if (singleton) {
    singleton.close();
    singleton = null;
  }
  const s = io(`${GAME_SERVER_URL}/game`, {
    transports: ['websocket'],
    auth: { token: makeDevToken(userId, displayName) },
  }) as GameSocket;
  singleton = s;
  connectedFor = userId;
  return s;
}

export function getSocket(): GameSocket | null {
  return singleton;
}

/** 把 ack 风格的 emit 包成 Promise，超时 5s。 */
export function emitAck<E extends keyof ClientToServerEvents, R>(
  event: E,
  ...args: unknown[]
): Promise<AckResult<R>> {
  return new Promise((resolve, reject) => {
    const s = singleton;
    if (!s || !s.connected) return reject(new Error('socket not connected'));
    const t = setTimeout(() => reject(new Error('ack timeout')), 5000);
    (s.emit as (...a: unknown[]) => void)(event, ...args, (res: AckResult<R>) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

/**
 * 在顶层组件调用一次，挂全局事件监听，自动同步到 zustand store。
 * 重渲染不会重连，userId 变化会重连。
 */
export function useSocket() {
  const userId = useAuthStore((s) => s.userId);
  const displayName = useAuthStore((s) => s.displayName);
  const setRoom = useRoomStore((s) => s.setRoom);
  const setSnapshot = useRoomStore((s) => s.setSnapshot);
  const setLastPlay = useRoomStore((s) => s.setLastPlay);
  const showToast = useRoomStore((s) => s.showToast);
  const initialized = useRef(false);

  useEffect(() => {
    if (!userId || !displayName) return;
    const s = ensureSocket(userId, displayName);
    if (initialized.current && s === singleton) return;
    initialized.current = true;

    const onRoom = (room: Parameters<ServerToClientEvents['room:updated']>[0]) =>
      setRoom(room);
    const onState = (snap: Parameters<ServerToClientEvents['game:state']>[0]) =>
      setSnapshot(snap);
    const onPlayed = (p: Parameters<ServerToClientEvents['game:played']>[0]) => {
      setLastPlay(p);
      showToast('info', `${p.seat} 出 ${p.cardIds.length} 张`);
    };
    const onPassed = (p: Parameters<ServerToClientEvents['game:passed']>[0]) =>
      showToast('info', `${p.seat} 过`);
    const onTrick = (p: Parameters<ServerToClientEvents['game:trick-closed']>[0]) => {
      setLastPlay(null);
      showToast('success', `本墩结束，${p.lead} 新墩首出`);
    };
    const onFinished = (p: Parameters<ServerToClientEvents['game:finished']>[0]) =>
      showToast('success', `本局结束！获胜队：${p.winnerTeam}`);
    const onErr = (p: { code: string; message: string }) =>
      showToast('error', `${p.code}: ${p.message}`);
    const onConnectErr = (e: Error) => showToast('error', `连接失败: ${e.message}`);

    s.on('room:updated', onRoom);
    s.on('game:state', onState);
    s.on('game:played', onPlayed);
    s.on('game:passed', onPassed);
    s.on('game:trick-closed', onTrick);
    s.on('game:finished', onFinished);
    s.on('error', onErr);
    s.on('connect_error', onConnectErr);

    return () => {
      s.off('room:updated', onRoom);
      s.off('game:state', onState);
      s.off('game:played', onPlayed);
      s.off('game:passed', onPassed);
      s.off('game:trick-closed', onTrick);
      s.off('game:finished', onFinished);
      s.off('error', onErr);
      s.off('connect_error', onConnectErr);
    };
  }, [userId, displayName, setRoom, setSnapshot, setLastPlay, showToast]);
}
