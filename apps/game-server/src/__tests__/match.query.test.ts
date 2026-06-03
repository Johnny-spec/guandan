import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMatchRepository, type MatchRecord } from '../match/match.repository.js';

function mk(
  id: string,
  startedAt: string,
  userIds: string[],
  result: MatchRecord['result'] = 'COMPLETED',
): Omit<MatchRecord, 'id'> & { id?: string } {
  return {
    id,
    roomId: `room-${id}`,
    kind: 'CASUAL',
    result,
    winnerTeam: result === 'COMPLETED' ? 'NS' : null,
    startLevel: '2',
    endLevel: result === 'COMPLETED' ? '3' : null,
    hasAiPlayers: false,
    durationMs: result === 'COMPLETED' ? 60000 : null,
    startedAt,
    finishedAt: result === 'COMPLETED' ? startedAt : null,
    players: userIds.map((u, i) => ({
      userId: u,
      displayName: u,
      seat: (['N', 'E', 'S', 'W'] as const)[i]!,
      team: i % 2 === 0 ? 'NS' : 'EW',
      isBot: false,
    })),
  };
}

describe('InMemoryMatchRepository.queryMatchesByUser', () => {
  let repo: InMemoryMatchRepository;
  beforeEach(() => {
    repo = new InMemoryMatchRepository();
    // 5 场 alice 参与的对局，时间递增
    for (let i = 1; i <= 5; i += 1) {
      const iso = new Date(2026, 0, i).toISOString();
      repo.createMatch(mk(`m${i}`, iso, ['alice', 'bob', 'carol', 'dan']));
    }
    // 一场 alice 没参与
    repo.createMatch(mk('mX', new Date(2026, 0, 10).toISOString(), ['x', 'y', 'z', 'w']));
    // 一场未完成
    repo.createMatch(
      mk('mP', new Date(2026, 0, 6).toISOString(), ['alice', 'bob', 'carol', 'dan'], 'PENDING'),
    );
  });

  it('默认按 startedAt 倒序，返回参与的所有对局', () => {
    const page = repo.queryMatchesByUser('alice', { limit: 10 });
    expect(page.items.map((m) => m.id)).toEqual(['mP', 'm5', 'm4', 'm3', 'm2', 'm1']);
    expect(page.total).toBe(6);
    expect(page.nextCursor).toBeNull();
  });

  it('limit + cursor 翻页', () => {
    const p1 = repo.queryMatchesByUser('alice', { limit: 2 });
    expect(p1.items.map((m) => m.id)).toEqual(['mP', 'm5']);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = repo.queryMatchesByUser('alice', { limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((m) => m.id)).toEqual(['m4', 'm3']);
    const p3 = repo.queryMatchesByUser('alice', { limit: 2, cursor: p2.nextCursor });
    expect(p3.items.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(p3.nextCursor).toBeNull();
  });

  it('since/until 区间筛选', () => {
    const page = repo.queryMatchesByUser('alice', {
      limit: 10,
      since: new Date(2026, 0, 2).toISOString(),
      until: new Date(2026, 0, 5).toISOString(), // until 不含
    });
    expect(page.items.map((m) => m.id)).toEqual(['m4', 'm3', 'm2']);
    expect(page.total).toBe(3);
  });

  it('completedOnly 过滤 PENDING/ABORTED', () => {
    const page = repo.queryMatchesByUser('alice', { limit: 10, completedOnly: true });
    expect(page.items.map((m) => m.id)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
    expect(page.items.every((m) => m.result === 'COMPLETED')).toBe(true);
  });

  it('不参与对局不返回', () => {
    const page = repo.queryMatchesByUser('alice', { limit: 10 });
    expect(page.items.find((m) => m.id === 'mX')).toBeUndefined();
  });

  it('坏游标（无法解析）→ 退化为不分页起点', () => {
    const page = repo.queryMatchesByUser('alice', { limit: 10, cursor: 'garbage' });
    expect(page.items.length).toBe(6);
  });
});
