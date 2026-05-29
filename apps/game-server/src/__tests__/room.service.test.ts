import { describe, expect, it } from 'vitest';
import { RoomService } from '../game/room.service.js';

describe('RoomService', () => {
  it('host 创建房间 + 3 人加入 → 4 座位填满', () => {
    const svc = new RoomService();
    const r = svc.createRoom('u1', 'A', 'public');
    expect(r.ok).toBe(true);
    const roomId = (r as { ok: true; room: { id: string } }).room.id;

    expect(svc.joinRoom(roomId, 'u2', 'B').ok).toBe(true);
    expect(svc.joinRoom(roomId, 'u3', 'C').ok).toBe(true);
    expect(svc.joinRoom(roomId, 'u4', 'D').ok).toBe(true);

    const fifth = svc.joinRoom(roomId, 'u5', 'E');
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.code).toBe('ROOM_FULL');

    const room = svc.getRoom(roomId)!;
    const seats = [...room.members.values()].map((m) => m.seat).sort();
    expect(seats).toEqual(['E', 'N', 'S', 'W']);
  });

  it('startGame：非 host 拒绝、人数不足拒绝、4 人成功', () => {
    const svc = new RoomService();
    const r = svc.createRoom('u1', 'A', 'public');
    const roomId = (r as { ok: true; room: { id: string } }).room.id;

    const e1 = svc.startGame(roomId, 'u1');
    expect(e1.ok).toBe(false);
    if (!e1.ok) expect(e1.code).toBe('NOT_ENOUGH_PLAYERS');

    svc.joinRoom(roomId, 'u2', 'B');
    svc.joinRoom(roomId, 'u3', 'C');
    svc.joinRoom(roomId, 'u4', 'D');

    const e2 = svc.startGame(roomId, 'u2');
    expect(e2.ok).toBe(false);
    if (!e2.ok) expect(e2.code).toBe('NOT_HOST');

    const ok = svc.startGame(roomId, 'u1');
    expect(ok.ok).toBe(true);

    const room = svc.getRoom(roomId)!;
    expect(room.session).not.toBeNull();
    expect(room.session!.handCount('N')).toBe(27);
    expect(room.session!.handCount('E')).toBe(27);
    expect(room.session!.handCount('S')).toBe(27);
    expect(room.session!.handCount('W')).toBe(27);
  });

  it('leaveRoom：房主退出 → 顺位让位；最后一人退出 → 房间销毁', () => {
    const svc = new RoomService();
    const roomId = (svc.createRoom('u1', 'A', 'public') as { ok: true; room: { id: string } }).room.id;
    svc.joinRoom(roomId, 'u2', 'B');

    const r = svc.leaveRoom(roomId, 'u1');
    expect(r.ok).toBe(true);
    expect(svc.getRoom(roomId)!.hostUserId).toBe('u2');

    svc.leaveRoom(roomId, 'u2');
    expect(svc.getRoom(roomId)).toBeNull();
  });

  it('markOffline 把成员标记为离线', () => {
    const svc = new RoomService();
    const roomId = (svc.createRoom('u1', 'A', 'public') as { ok: true; room: { id: string } }).room.id;
    const r = svc.markOffline('u1');
    expect(r).not.toBeNull();
    expect(r!.room.players[0]!.isOffline).toBe(true);
  });

  it('同一 userId 不能同时在两个房间', () => {
    const svc = new RoomService();
    svc.createRoom('u1', 'A', 'public');
    const r2 = svc.createRoom('u1', 'A', 'public');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('ALREADY_IN_ROOM');
  });
});
