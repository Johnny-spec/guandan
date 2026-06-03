import { describe, expect, it, beforeEach } from 'vitest';
import { ReplayService } from '../replay/replay.service.js';

describe('ReplayService', () => {
  let svc: ReplayService;
  beforeEach(() => {
    svc = new ReplayService();
  });

  it('append 单局事件按 seq 单调递增', () => {
    svc.recordMatchStart('m1', { roomId: 'r1', startLevel: '2', seats: [] });
    svc.recordPlay('m1', { seat: 'N', cardIds: ['c1', 'c2'] });
    svc.recordPass('m1', { seat: 'E' });
    const list = svc.list('m1');
    expect(list).toHaveLength(3);
    expect(list.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(list.map((e) => e.kind)).toEqual(['match_start', 'play', 'pass']);
  });

  it('多局事件相互隔离', () => {
    svc.recordPlay('m1', { seat: 'N', cardIds: ['a'] });
    svc.recordPlay('m2', { seat: 'S', cardIds: ['b'] });
    svc.recordPlay('m1', { seat: 'E', cardIds: ['c'] });
    expect(svc.list('m1')).toHaveLength(2);
    expect(svc.list('m2')).toHaveLength(1);
    expect(svc.list('m1').map((e) => e.seq)).toEqual([1, 2]);
    expect(svc.list('m2')[0]!.seq).toBe(1);
  });

  it('未知 matchId 返回空数组（不 throw）', () => {
    expect(svc.list('ghost')).toEqual([]);
    expect(svc.meta('ghost').eventCount).toBe(0);
    expect(svc.meta('ghost').finishedAtMs).toBeNull();
  });

  it('meta.startedAtMs 取首事件时间', async () => {
    const t0 = Date.now();
    svc.recordMatchStart('m1', { roomId: 'r1', startLevel: '2', seats: [] });
    await new Promise((r) => setTimeout(r, 5));
    svc.recordPlay('m1', { seat: 'N', cardIds: [] });
    const meta = svc.meta('m1');
    expect(meta.startedAtMs).toBeGreaterThanOrEqual(t0);
    expect(meta.eventCount).toBe(2);
    expect(meta.finishedAtMs).toBeNull();
  });

  it('match_finish 锁定 finishedAtMs（首次写入幂等）', async () => {
    svc.recordMatchFinish('m1', {
      winnerTeam: 'NS',
      finishedOrder: ['N'],
      endLevel: '3',
      durationMs: 1000,
    });
    const t1 = svc.meta('m1').finishedAtMs;
    expect(t1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    svc.recordMatchFinish('m1', {
      winnerTeam: 'EW',
      finishedOrder: [],
      endLevel: '3',
      durationMs: 999,
    });
    expect(svc.meta('m1').finishedAtMs).toBe(t1);
    expect(svc.list('m1')).toHaveLength(2);
  });

  it('append 空 matchId 抛错', () => {
    expect(() => svc.recordPlay('', { seat: 'N', cardIds: [] })).toThrow(/empty matchId/);
  });

  it('clear(matchId) 与 clear() 行为正确', () => {
    svc.recordPlay('m1', { seat: 'N', cardIds: [] });
    svc.recordPlay('m2', { seat: 'S', cardIds: [] });
    svc.clear('m1');
    expect(svc.list('m1')).toEqual([]);
    expect(svc.list('m2')).toHaveLength(1);
    svc.clear();
    expect(svc.list('m2')).toEqual([]);
  });

  it('trick_closed payload 完整保留', () => {
    svc.recordTrickClosed('m1', { lead: 'W' });
    const e = svc.list('m1')[0]!;
    expect(e.kind).toBe('trick_closed');
    if (e.kind === 'trick_closed') {
      expect(e.payload.lead).toBe('W');
    }
  });
});
