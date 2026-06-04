import { describe, expect, it } from 'vitest';
import { RoomService } from '../game/room.service.js';

function newRoom(svc: RoomService, host = 'host1'): string {
  const r = svc.createRoom(host, 'Host', 'public');
  if (!r.ok) throw new Error('createRoom failed');
  return r.room.id;
}

describe('RoomService · Spectator', () => {
  it('addSpectator 成功 → 出现在 spectatorIds 中（来自 RoomDetail）', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    const r = svc.addSpectator(roomId, 'spec1', 'Spec One');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.room.spectatorIds).toEqual(['spec1']);
    }
  });

  it('多名观战者 → 全部出现在 spectatorIds（保持插入顺序）', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    svc.addSpectator(roomId, 'a', 'A');
    svc.addSpectator(roomId, 'b', 'B');
    svc.addSpectator(roomId, 'c', 'C');
    const room = svc.getRoom(roomId)!;
    expect(svc.toSummary(room).spectatorIds).toEqual(['a', 'b', 'c']);
  });

  it('addSpectator 幂等：同一人重复加入不报错且只占一席', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    expect(svc.addSpectator(roomId, 'x', 'X').ok).toBe(true);
    const r2 = svc.addSpectator(roomId, 'x', 'X');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.room.spectatorIds).toEqual(['x']);
  });

  it('玩家不能同时观战自己所在的房间（ALREADY_IN_ROOM）', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc, 'host1');
    const r = svc.addSpectator(roomId, 'host1', 'Host');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ALREADY_IN_ROOM');
  });

  it('已观战其它房间 → 拒绝（ALREADY_SPECTATING）', () => {
    const svc = new RoomService();
    const room1 = newRoom(svc, 'h1');
    const room2 = newRoom(svc, 'h2');
    expect(svc.addSpectator(room1, 'spec', 'S').ok).toBe(true);
    const r = svc.addSpectator(room2, 'spec', 'S');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ALREADY_SPECTATING');
  });

  it('removeSpectator 释放占位 → 可再观战其它房间', () => {
    const svc = new RoomService();
    const room1 = newRoom(svc, 'h1');
    const room2 = newRoom(svc, 'h2');
    svc.addSpectator(room1, 'spec', 'S');
    svc.removeSpectator(room1, 'spec');
    expect(svc.addSpectator(room2, 'spec', 'S').ok).toBe(true);
  });

  it('removeSpectator 幂等：不存在的观战者也返回 ok', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    const r = svc.removeSpectator(roomId, 'ghost');
    expect(r.ok).toBe(true);
  });

  it('removeSpectator 不存在房间 → ROOM_NOT_FOUND', () => {
    const svc = new RoomService();
    const r = svc.removeSpectator('no-such', 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ROOM_NOT_FOUND');
  });

  it('detachSpectator（断线钩子）：返回房间并清掉 spectator', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    svc.addSpectator(roomId, 'spec', 'S');
    const r = svc.detachSpectator('spec');
    expect(r).not.toBeNull();
    expect(r!.roomId).toBe(roomId);
    expect(svc.isSpectator(roomId, 'spec')).toBe(false);
  });

  it('detachSpectator：非观战者返回 null', () => {
    const svc = new RoomService();
    expect(svc.detachSpectator('nobody')).toBeNull();
  });

  it('唯一成员离开但仍有观战者 → 不销毁房间', () => {
    const svc = new RoomService();
    const r = svc.createRoom('host', 'H', 'public');
    if (!r.ok) throw new Error('boom');
    const roomId = r.room.id;
    svc.addSpectator(roomId, 'spec', 'S');
    const leave = svc.leaveRoom(roomId, 'host');
    expect(leave.ok).toBe(true);
    if (leave.ok) expect(leave.room).not.toBeNull();
    // 房间依然存在
    expect(svc.getRoom(roomId)).not.toBeNull();
  });

  it('最后一名观战者离开且无成员 → 销毁房间', () => {
    const svc = new RoomService();
    const r = svc.createRoom('host', 'H', 'public');
    if (!r.ok) throw new Error('boom');
    const roomId = r.room.id;
    svc.addSpectator(roomId, 'spec', 'S');
    svc.leaveRoom(roomId, 'host');
    const rem = svc.removeSpectator(roomId, 'spec');
    expect(rem.ok).toBe(true);
    if (rem.ok) expect(rem.room).toBeNull();
    expect(svc.getRoom(roomId)).toBeNull();
  });

  it('getSpectatorRoom：能反查观战所在房间', () => {
    const svc = new RoomService();
    const roomId = newRoom(svc);
    svc.addSpectator(roomId, 'spec', 'S');
    expect(svc.getSpectatorRoom('spec')?.id).toBe(roomId);
    svc.removeSpectator(roomId, 'spec');
    expect(svc.getSpectatorRoom('spec')).toBeNull();
  });
});
