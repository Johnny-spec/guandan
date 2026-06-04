import { describe, expect, it } from 'vitest';
import { RoomService } from '../game/room.service.js';

function fullRoom(svc: RoomService): string {
  const r = svc.createRoom('u1', 'A', 'public');
  if (!r.ok) throw new Error('createRoom');
  const id = r.room.id;
  svc.joinRoom(id, 'u2', 'B');
  svc.joinRoom(id, 'u3', 'C');
  svc.joinRoom(id, 'u4', 'D');
  return id;
}

describe('RoomService · referee actions', () => {
  it('kickMember 移除成员并广播更新（房间仍存在）', () => {
    const svc = new RoomService();
    const id = fullRoom(svc);
    const r = svc.kickMember(id, 'u2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kicked).toBe(true);
      expect(r.room).not.toBeNull();
      expect(r.room!.players.find((p) => p.userId === 'u2')).toBeUndefined();
    }
    expect(svc.getRoomForUser('u2')).toBeNull();
  });

  it('kickMember 不存在的目标 → NOT_IN_ROOM', () => {
    const svc = new RoomService();
    const id = fullRoom(svc);
    const r = svc.kickMember(id, 'ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_IN_ROOM');
  });

  it('kickMember 不存在的房间 → ROOM_NOT_FOUND', () => {
    const svc = new RoomService();
    const r = svc.kickMember('no-such', 'u1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ROOM_NOT_FOUND');
  });

  it('kick 房主 → 顺位让位给剩余成员', () => {
    const svc = new RoomService();
    const id = fullRoom(svc);
    const r = svc.kickMember(id, 'u1');
    expect(r.ok).toBe(true);
    const room = svc.getRoom(id)!;
    expect(room.hostUserId).not.toBe('u1');
    expect(['u2', 'u3', 'u4']).toContain(room.hostUserId);
  });

  it('kick 最后一人 → 房间销毁', () => {
    const svc = new RoomService();
    const r = svc.createRoom('solo', 'S', 'public');
    if (!r.ok) throw new Error('boom');
    const id = r.room.id;
    const k = svc.kickMember(id, 'solo');
    expect(k.ok).toBe(true);
    if (k.ok) {
      expect(k.room).toBeNull();
      expect(k.kicked).toBe(true);
    }
    expect(svc.getRoom(id)).toBeNull();
  });

  it('forceEndSession 清掉 session 回到 idle，hadSession=true', () => {
    const svc = new RoomService();
    const id = fullRoom(svc);
    svc.startGame(id, 'u1');
    expect(svc.getRoom(id)!.session).not.toBeNull();
    const r = svc.forceEndSession(id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hadSession).toBe(true);
      expect(r.room.phase).toBe('idle');
    }
    expect(svc.getRoom(id)!.session).toBeNull();
  });

  it('forceEndSession 无 session 时 hadSession=false', () => {
    const svc = new RoomService();
    const id = fullRoom(svc);
    const r = svc.forceEndSession(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hadSession).toBe(false);
  });

  it('forceEndSession 不存在的房间 → ROOM_NOT_FOUND', () => {
    const svc = new RoomService();
    const r = svc.forceEndSession('no-such');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ROOM_NOT_FOUND');
  });
});
