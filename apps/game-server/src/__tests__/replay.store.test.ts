import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplayService } from '../replay/replay.service.js';
import { InMemoryReplayStore, JsonlReplayStore } from '../replay/replay.store.js';
import type { ReplayEvent } from '../replay/replay.types.js';

function mkEvent(matchId: string, seq: number, kind: ReplayEvent['kind']): ReplayEvent {
  const tsMs = 1_700_000_000_000 + seq;
  switch (kind) {
    case 'match_start':
      return { matchId, seq, tsMs, kind, payload: { roomId: 'r1', startLevel: '2', seats: [] } };
    case 'play':
      return { matchId, seq, tsMs, kind, payload: { seat: 'N', cardIds: ['a'] } };
    case 'pass':
      return { matchId, seq, tsMs, kind, payload: { seat: 'E' } };
    case 'trick_closed':
      return { matchId, seq, tsMs, kind, payload: { lead: 'S' } };
    case 'match_finish':
      return {
        matchId,
        seq,
        tsMs,
        kind,
        payload: { winnerTeam: 'NS', finishedOrder: ['N'], endLevel: '3', durationMs: 100 },
      };
  }
}

describe('InMemoryReplayStore', () => {
  it('append + list 按写入顺序返回', () => {
    const s = new InMemoryReplayStore();
    s.append('m1', mkEvent('m1', 1, 'match_start'));
    s.append('m1', mkEvent('m1', 2, 'play'));
    expect(s.list('m1').map((e) => e.seq)).toEqual([1, 2]);
    expect(s.list('ghost')).toEqual([]);
  });

  it('clear(matchId) 与 clear() 行为正确', () => {
    const s = new InMemoryReplayStore();
    s.append('m1', mkEvent('m1', 1, 'play'));
    s.append('m2', mkEvent('m2', 1, 'play'));
    s.clear('m1');
    expect(s.list('m1')).toEqual([]);
    expect(s.list('m2')).toHaveLength(1);
    s.clear();
    expect(s.list('m2')).toEqual([]);
  });
});

describe('JsonlReplayStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'replay-jsonl-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('append 同步落盘为 JSONL，list 顺序保留', () => {
    const s = new JsonlReplayStore(dir);
    s.append('m1', mkEvent('m1', 1, 'match_start'));
    s.append('m1', mkEvent('m1', 2, 'play'));
    s.append('m1', mkEvent('m1', 3, 'match_finish'));
    const fp = join(dir, 'm1.jsonl');
    expect(existsSync(fp)).toBe(true);
    const lines = readFileSync(fp, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).kind).toBe('match_start');
    expect(JSON.parse(lines[2]!).kind).toBe('match_finish');
    expect(s.list('m1').map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('新实例从同一目录恢复事件（持久化语义）', () => {
    const s1 = new JsonlReplayStore(dir);
    s1.append('m1', mkEvent('m1', 1, 'play'));
    s1.append('m1', mkEvent('m1', 2, 'pass'));
    const s2 = new JsonlReplayStore(dir);
    const list = s2.list('m1');
    expect(list).toHaveLength(2);
    expect(list[0]!.kind).toBe('play');
    expect(list[1]!.kind).toBe('pass');
  });

  it('list 未知 matchId 返回空数组（不创建文件）', () => {
    const s = new JsonlReplayStore(dir);
    expect(s.list('ghost')).toEqual([]);
    expect(existsSync(join(dir, 'ghost.jsonl'))).toBe(false);
  });

  it('clear(matchId) 删除文件 + 缓存', () => {
    const s = new JsonlReplayStore(dir);
    s.append('m1', mkEvent('m1', 1, 'play'));
    expect(existsSync(join(dir, 'm1.jsonl'))).toBe(true);
    s.clear('m1');
    expect(existsSync(join(dir, 'm1.jsonl'))).toBe(false);
    expect(s.list('m1')).toEqual([]);
  });

  it('clear() 清空目录下所有 .jsonl', () => {
    const s = new JsonlReplayStore(dir);
    s.append('m1', mkEvent('m1', 1, 'play'));
    s.append('m2', mkEvent('m2', 1, 'play'));
    s.clear();
    expect(existsSync(join(dir, 'm1.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'm2.jsonl'))).toBe(false);
    expect(s.list('m1')).toEqual([]);
  });

  it('恶意 matchId 拒绝（防路径注入）', () => {
    const s = new JsonlReplayStore(dir);
    expect(() => s.append('../etc/passwd', mkEvent('x', 1, 'play'))).toThrow(/unsafe matchId/);
    expect(() => s.append('a/b', mkEvent('x', 1, 'play'))).toThrow(/unsafe matchId/);
  });
});

describe('ReplayService + JsonlReplayStore 集成', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'replay-jsonl-int-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('录入一局后新建 service 从磁盘恢复 meta + 事件', () => {
    const store1 = new JsonlReplayStore(dir);
    const svc1 = new ReplayService(store1);
    svc1.recordMatchStart('mX', { roomId: 'r1', startLevel: '2', seats: [] });
    svc1.recordPlay('mX', { seat: 'N', cardIds: ['c1'] });
    svc1.recordPass('mX', { seat: 'E' });
    svc1.recordMatchFinish('mX', {
      winnerTeam: 'NS',
      finishedOrder: ['N'],
      endLevel: '3',
      durationMs: 1000,
    });
    const meta1 = svc1.meta('mX');
    expect(meta1.eventCount).toBe(4);
    expect(meta1.finishedAtMs).not.toBeNull();

    // 新 service 复用同目录
    const store2 = new JsonlReplayStore(dir);
    const svc2 = new ReplayService(store2);
    expect(svc2.list('mX').map((e) => e.kind)).toEqual([
      'match_start',
      'play',
      'pass',
      'match_finish',
    ]);
    expect(svc2.meta('mX').finishedAtMs).toBe(meta1.finishedAtMs);
    expect(svc2.meta('mX').startedAtMs).toBe(meta1.startedAtMs);
  });

  it('finishedAtMs 派生自首次 match_finish（再次写入不影响）', () => {
    const svc = new ReplayService(new JsonlReplayStore(dir));
    svc.recordMatchFinish('mY', {
      winnerTeam: 'NS',
      finishedOrder: ['N'],
      endLevel: '3',
      durationMs: 1,
    });
    const t1 = svc.meta('mY').finishedAtMs;
    svc.recordMatchFinish('mY', {
      winnerTeam: 'EW',
      finishedOrder: [],
      endLevel: '3',
      durationMs: 2,
    });
    expect(svc.meta('mY').finishedAtMs).toBe(t1);
    expect(svc.list('mY')).toHaveLength(2);
  });
});
