import { describe, expect, it } from 'vitest';
import {
  buildWelcomeCard,
  buildRoomCreatedCard,
  buildMatchFinishedCard,
  buildRefereeActionCard,
  templates,
  type AdaptiveCard,
  type RefereeActionKind,
} from '../index.js';

/**
 * Adaptive Card 渲染快照测试。
 *
 * 防止：
 *   - 卡片结构 / 文案被意外改动而无对应测试更新
 *   - schema / version 漂移导致 Teams 端解析失败
 *   - Action data 字段（bot 端 verb 路由依赖）被改名
 */

function assertCardShape(card: AdaptiveCard): void {
  expect(card.type).toBe('AdaptiveCard');
  expect(card.$schema).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
  expect(card.version).toBe('1.5');
  expect(Array.isArray(card.body)).toBe(true);
  expect(card.body.length).toBeGreaterThan(0);
}

describe('welcome template (legacy JSON)', () => {
  it('保留 createRoom / quickMatch verb 不被改名', () => {
    const verbs = templates.welcome.actions.map((a) => (a.data as { verb: string }).verb);
    expect(verbs).toEqual(['createRoom', 'quickMatch']);
  });
});

describe('buildWelcomeCard', () => {
  it('快照', () => {
    const c = buildWelcomeCard();
    assertCardShape(c);
    expect(c).toMatchSnapshot();
  });
});

describe('buildRoomCreatedCard', () => {
  it('快照：含观战人数 + join/spectate 双操作', () => {
    const c = buildRoomCreatedCard({
      roomId: 'R-12345',
      hostDisplayName: '张三',
      spectatorCount: 2,
    });
    assertCardShape(c);
    expect(c).toMatchSnapshot();
  });

  it('spectatorCount 缺省为 0', () => {
    const c = buildRoomCreatedCard({ roomId: 'R-1', hostDisplayName: 'h' });
    const factSet = c.body.find((b) => b.type === 'FactSet');
    expect(factSet?.type).toBe('FactSet');
    if (factSet?.type === 'FactSet') {
      const spectFact = factSet.facts.find((f) => f.title === '观战人数');
      expect(spectFact?.value).toBe('0');
    }
  });

  it('action data 携带 roomId 用于 bot 路由', () => {
    const c = buildRoomCreatedCard({ roomId: 'R-9', hostDisplayName: 'h' });
    expect(c.actions).toBeDefined();
    for (const a of c.actions!) {
      expect((a.data as { roomId: string }).roomId).toBe('R-9');
    }
  });
});

describe('buildMatchFinishedCard', () => {
  it('快照：含 rating delta', () => {
    const c = buildMatchFinishedCard({
      matchId: 'M-1',
      winnerTeam: 'NS',
      endLevel: 'A',
      durationMs: 12 * 60_000 + 34_000,
      ratingDeltas: [
        { displayName: '张三', delta: 18 },
        { displayName: '李四', delta: -12 },
      ],
    });
    assertCardShape(c);
    expect(c).toMatchSnapshot();
  });

  it('无 ratingDeltas 时不渲染段位 Container', () => {
    const c = buildMatchFinishedCard({
      matchId: 'M-2',
      winnerTeam: 'EW',
      endLevel: '3',
      durationMs: 1000,
    });
    const containers = c.body.filter((b) => b.type === 'Container');
    expect(containers).toHaveLength(0);
  });

  it('用时格式化：秒不足 10 补零', () => {
    const c = buildMatchFinishedCard({
      matchId: 'M-3',
      winnerTeam: 'NS',
      endLevel: '2',
      durationMs: 1 * 60_000 + 3_000,
    });
    const factSet = c.body.find((b) => b.type === 'FactSet');
    if (factSet?.type === 'FactSet') {
      const dur = factSet.facts.find((f) => f.title === '用时');
      expect(dur?.value).toBe('1分03秒');
    }
  });

  it('Action 携带 matchId 用于回放跳转', () => {
    const c = buildMatchFinishedCard({
      matchId: 'M-4',
      winnerTeam: 'NS',
      endLevel: '3',
      durationMs: 0,
    });
    expect(c.actions?.[0]?.data).toEqual({ verb: 'viewReplay', matchId: 'M-4' });
  });
});

describe('buildRefereeActionCard', () => {
  const all: RefereeActionKind[] = ['warn', 'mute', 'unmute', 'kick', 'force_end', 'note'];

  it.each(all)('快照：kind=%s', (kind) => {
    const c = buildRefereeActionCard({
      kind,
      refereeUserId: 'admin1',
      roomId: 'R-7',
      targetUserId: kind === 'note' || kind === 'force_end' ? undefined : 'user-9',
      reason: kind === 'note' ? '比赛日常巡查记录' : undefined,
    });
    assertCardShape(c);
    expect(c).toMatchSnapshot();
  });

  it('Container style 按 kind 区分（attention / warning / good / default）', () => {
    const styles: Record<RefereeActionKind, string> = {
      warn: 'warning',
      mute: 'attention',
      unmute: 'good',
      kick: 'attention',
      force_end: 'attention',
      note: 'default',
    };
    for (const kind of all) {
      const c = buildRefereeActionCard({ kind, refereeUserId: 'a', roomId: 'r' });
      const container = c.body[0];
      expect(container?.type).toBe('Container');
      if (container?.type === 'Container') {
        expect(container.style).toBe(styles[kind]);
      }
    }
  });

  it('targetUserId / reason 可选；不传则 FactSet 中不出现', () => {
    const c = buildRefereeActionCard({ kind: 'note', refereeUserId: 'a', roomId: 'r' });
    const container = c.body[0];
    if (container?.type === 'Container') {
      const fs = container.items.find((i) => i.type === 'FactSet');
      if (fs?.type === 'FactSet') {
        const titles = fs.facts.map((f) => f.title);
        expect(titles).not.toContain('对象');
        expect(titles).not.toContain('理由');
      }
    }
  });
});
