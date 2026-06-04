import { describe, expect, it, beforeEach } from 'vitest';
import { RefereeService } from '../referee/referee.service.js';

describe('RefereeService · roles', () => {
  let svc: RefereeService;
  beforeEach(() => {
    svc = new RefereeService();
  });

  it('assignReferee 首次返回 true，重复 false；isReferee 反映状态', () => {
    expect(svc.isReferee('u1')).toBe(false);
    expect(svc.assignReferee('u1')).toBe(true);
    expect(svc.assignReferee('u1')).toBe(false);
    expect(svc.isReferee('u1')).toBe(true);
  });

  it('revokeReferee：存在返回 true，不存在 false', () => {
    svc.assignReferee('u1');
    expect(svc.revokeReferee('u1')).toBe(true);
    expect(svc.revokeReferee('u1')).toBe(false);
    expect(svc.isReferee('u1')).toBe(false);
  });

  it('listReferees 返回所有当前裁判', () => {
    svc.assignReferee('a');
    svc.assignReferee('b');
    svc.assignReferee('c');
    svc.revokeReferee('b');
    expect([...svc.listReferees()].sort()).toEqual(['a', 'c']);
  });

  it('assignReferee 空 userId 抛错', () => {
    expect(() => svc.assignReferee('')).toThrow(/userId/);
  });
});

describe('RefereeService · recordAction', () => {
  let svc: RefereeService;
  beforeEach(() => {
    svc = new RefereeService();
  });

  it('生成单调递增 id（1-based）', () => {
    const a = svc.recordAction({ refereeUserId: 'r1', kind: 'note', roomId: 'room-1' });
    const b = svc.recordAction({ refereeUserId: 'r1', kind: 'note', roomId: 'room-1' });
    const c = svc.recordAction({ refereeUserId: 'r1', kind: 'note', roomId: 'room-2' });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(c.id).toBe(3);
  });

  it('warn / mute / unmute / kick 必须提供 targetUserId', () => {
    for (const kind of ['warn', 'mute', 'unmute', 'kick'] as const) {
      expect(() =>
        svc.recordAction({ refereeUserId: 'r', kind, roomId: 'room-1' }),
      ).toThrow(/targetUserId/);
    }
  });

  it('force_end / note 允许无 targetUserId', () => {
    expect(() =>
      svc.recordAction({ refereeUserId: 'r', kind: 'force_end', roomId: 'room-1' }),
    ).not.toThrow();
    expect(() =>
      svc.recordAction({ refereeUserId: 'r', kind: 'note', roomId: 'room-1' }),
    ).not.toThrow();
  });

  it('空 refereeUserId / roomId → 抛错', () => {
    expect(() =>
      svc.recordAction({ refereeUserId: '', kind: 'note', roomId: 'room-1' }),
    ).toThrow();
    expect(() =>
      svc.recordAction({ refereeUserId: 'r', kind: 'note', roomId: '' }),
    ).toThrow();
  });

  it('保留 reason / matchId / targetUserId 等可选字段', () => {
    const a = svc.recordAction({
      refereeUserId: 'r1',
      kind: 'kick',
      roomId: 'room-1',
      matchId: 'match-1',
      targetUserId: 'cheater-1',
      reason: '违规出牌',
    });
    expect(a.matchId).toBe('match-1');
    expect(a.targetUserId).toBe('cheater-1');
    expect(a.reason).toBe('违规出牌');
  });
});

describe('RefereeService · list', () => {
  let svc: RefereeService;
  beforeEach(() => {
    svc = new RefereeService();
    // 插入 6 条样本
    svc.recordAction({ refereeUserId: 'r1', kind: 'warn', roomId: 'A', targetUserId: 't1' });
    svc.recordAction({ refereeUserId: 'r1', kind: 'kick', roomId: 'A', matchId: 'm1', targetUserId: 't2' });
    svc.recordAction({ refereeUserId: 'r2', kind: 'note', roomId: 'B' });
    svc.recordAction({ refereeUserId: 'r2', kind: 'mute', roomId: 'B', targetUserId: 't1' });
    svc.recordAction({ refereeUserId: 'r1', kind: 'force_end', roomId: 'A', matchId: 'm1' });
    svc.recordAction({ refereeUserId: 'r2', kind: 'unmute', roomId: 'B', targetUserId: 't1' });
  });

  it('默认按 id 倒序（最新在前）', () => {
    const all = svc.list();
    expect(all.map((a) => a.id)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('按 roomId 过滤', () => {
    const a = svc.list({ roomId: 'A' });
    expect(a.every((x) => x.roomId === 'A')).toBe(true);
    expect(a).toHaveLength(3);
  });

  it('按 matchId 过滤', () => {
    const m = svc.list({ matchId: 'm1' });
    expect(m.map((a) => a.id).sort()).toEqual([2, 5]);
  });

  it('按 refereeUserId 过滤', () => {
    expect(svc.list({ refereeUserId: 'r1' })).toHaveLength(3);
    expect(svc.list({ refereeUserId: 'r2' })).toHaveLength(3);
  });

  it('按 targetUserId 过滤', () => {
    expect(svc.list({ targetUserId: 't1' }).map((a) => a.id).sort()).toEqual([1, 4, 6]);
  });

  it('按 kind 过滤', () => {
    expect(svc.list({ kind: 'note' })).toHaveLength(1);
    expect(svc.list({ kind: 'kick' })).toHaveLength(1);
  });

  it('limit 截断，最多 500', () => {
    expect(svc.list({ limit: 2 })).toHaveLength(2);
    expect(svc.list({ limit: 999 })).toHaveLength(6);
  });

  it('clear 清空动作与角色', () => {
    svc.assignReferee('r1');
    svc.clear();
    expect(svc.count()).toBe(0);
    expect(svc.isReferee('r1')).toBe(false);
    expect(svc.list()).toHaveLength(0);
  });

  it('sinceMs 过滤老事件', () => {
    const future = Date.now() + 60_000;
    expect(svc.list({ sinceMs: future })).toHaveLength(0);
    expect(svc.list({ sinceMs: 0 })).toHaveLength(6);
  });
});
