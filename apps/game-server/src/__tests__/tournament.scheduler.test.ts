import { beforeEach, describe, expect, it } from 'vitest';
import { TournamentService } from '../tournament/tournament.service.js';
import { InMemoryTournamentRepository } from '../tournament/tournament.repository.js';
import { TournamentScheduler } from '../tournament/tournament.scheduler.js';

function makeCtx() {
  const repo = new InMemoryTournamentRepository();
  const svc = new TournamentService(repo);
  const scheduler = new TournamentScheduler(svc, repo);
  return { repo, svc, scheduler };
}

function seedOpenTournament(
  svc: TournamentService,
  opts: { closesAt?: string | null; maxTeams?: number } = {},
) {
  const t = svc.createTournament({
    name: 'Auto Cup',
    hostUserId: 'host-1',
    maxTeams: opts.maxTeams ?? 4,
    registrationClosesAt: opts.closesAt ?? null,
  });
  svc.openRegistration(t.id);
  return t;
}

function addEntry(svc: TournamentService, id: string, captain: string, name: string) {
  return svc.registerEntry(id, { captainUserId: captain, teamName: name });
}

describe('TournamentScheduler', () => {
  let ctx: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('does nothing when no OPEN tournaments exist', () => {
    const r = ctx.scheduler.tickOnce(new Date('2030-01-01T00:00:00Z'));
    expect(r.scanned).toBe(0);
    expect(r.actions).toEqual([]);
  });

  it('AUTO_START when deadline passed and >= 2 active entries', () => {
    const { svc, scheduler, repo } = ctx;
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const r = scheduler.tickOnce(new Date('2030-01-01T00:00:01Z'));
    expect(r.scanned).toBe(1);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.kind).toBe('AUTO_START');
    expect(repo.getTournament(t.id)?.status).toBe('RUNNING');
  });

  it('AUTO_CANCEL when deadline passed and < 2 entries', () => {
    const { svc, scheduler, repo } = ctx;
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    const r = scheduler.tickOnce(new Date('2030-01-01T00:00:01Z'));
    expect(r.actions[0]!.kind).toBe('AUTO_CANCEL');
    expect(r.actions[0]!.reason).toContain('only 1 entries');
    expect(repo.getTournament(t.id)?.status).toBe('CANCELLED');
  });

  it('AUTO_START when tournament reaches maxTeams (even before deadline)', () => {
    const { svc, scheduler, repo } = ctx;
    const t = seedOpenTournament(svc, { maxTeams: 2, closesAt: '2099-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const r = scheduler.tickOnce(new Date('2026-06-09T00:00:00Z'));
    expect(r.actions[0]!.kind).toBe('AUTO_START');
    expect(r.actions[0]!.reason).toContain('full');
    expect(repo.getTournament(t.id)?.status).toBe('RUNNING');
  });

  it('does nothing while deadline in future and not full', () => {
    const { svc, scheduler, repo } = ctx;
    const t = seedOpenTournament(svc, { closesAt: '2099-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const r = scheduler.tickOnce(new Date('2026-06-09T00:00:00Z'));
    expect(r.actions).toEqual([]);
    expect(repo.getTournament(t.id)?.status).toBe('OPEN');
  });

  it('ignores tournaments with null registrationClosesAt unless full', () => {
    const { svc, scheduler } = ctx;
    const t = seedOpenTournament(svc, { closesAt: null });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const r = scheduler.tickOnce(new Date('2030-01-01T00:00:00Z'));
    expect(r.actions).toEqual([]);
  });

  it('does not re-act on already RUNNING tournaments', () => {
    const { svc, scheduler } = ctx;
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    scheduler.tickOnce(new Date('2030-01-01T00:00:01Z')); // start
    const r2 = scheduler.tickOnce(new Date('2030-01-01T00:00:02Z'));
    expect(r2.actions).toEqual([]);
    expect(r2.scanned).toBe(0);
  });

  it('processes multiple OPEN tournaments in one tick independently', () => {
    const { svc, scheduler, repo } = ctx;
    const t1 = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t1.id, 'u1', 'A');
    addEntry(svc, t1.id, 'u2', 'B');
    const t2 = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t2.id, 'u3', 'C'); // only 1 → cancel
    const r = scheduler.tickOnce(new Date('2030-01-01T00:00:05Z'));
    expect(r.scanned).toBe(2);
    expect(r.actions).toHaveLength(2);
    const kinds = r.actions.map((a) => a.kind).sort();
    expect(kinds).toEqual(['AUTO_CANCEL', 'AUTO_START']);
    expect(repo.getTournament(t1.id)?.status).toBe('RUNNING');
    expect(repo.getTournament(t2.id)?.status).toBe('CANCELLED');
  });

  it('records actions to bounded history ring buffer', () => {
    const { svc, repo } = ctx;
    const scheduler = new TournamentScheduler(svc, repo, undefined, { historySize: 3 });
    for (let i = 0; i < 5; i++) {
      const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z', maxTeams: 4 });
      addEntry(svc, t.id, `u${i}a`, 'A');
      addEntry(svc, t.id, `u${i}b`, 'B');
      scheduler.tickOnce(new Date('2030-01-01T00:00:01Z'));
    }
    expect(scheduler.recentActions(10)).toHaveLength(3);
  });

  it('captures TournamentError into ERROR action without breaking the tick', () => {
    const { svc, scheduler, repo } = ctx;
    // 故意构造一个 OPEN 但调用 startTournament 时会失败的情况：
    // mock svc.startTournament 抛错，验证 ERROR 分支
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const original = svc.startTournament.bind(svc);
    svc.startTournament = (() => {
      throw new Error('boom');
    }) as typeof svc.startTournament;
    try {
      const r = scheduler.tickOnce(new Date('2030-01-01T00:00:01Z'));
      expect(r.actions[0]!.kind).toBe('ERROR');
      expect(r.actions[0]!.reason).toContain('boom');
      // tournament 仍然在 OPEN
      expect(repo.getTournament(t.id)?.status).toBe('OPEN');
    } finally {
      svc.startTournament = original;
    }
  });

  it('uses injected Clock when explicitNow omitted', () => {
    const { svc, repo } = ctx;
    const clock = { now: () => new Date('2030-01-01T00:00:01Z') };
    const scheduler = new TournamentScheduler(svc, repo, clock);
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    addEntry(svc, t.id, 'u1', 'A');
    addEntry(svc, t.id, 'u2', 'B');
    const r = scheduler.tickOnce();
    expect(r.actions[0]!.kind).toBe('AUTO_START');
  });

  it('counts CONFIRMED + PENDING but ignores WITHDRAWN / KICKED', () => {
    const { svc, scheduler, repo } = ctx;
    const t = seedOpenTournament(svc, { closesAt: '2030-01-01T00:00:00Z' });
    const e1 = addEntry(svc, t.id, 'u1', 'A');
    const e2 = addEntry(svc, t.id, 'u2', 'B');
    addEntry(svc, t.id, 'u3', 'C');
    svc.updateEntryStatus(e1.id, 'WITHDRAWN');
    svc.updateEntryStatus(e2.id, 'KICKED');
    // 剩 1 个 active → AUTO_CANCEL
    const r = scheduler.tickOnce(new Date('2030-01-01T00:00:01Z'));
    expect(r.actions[0]!.kind).toBe('AUTO_CANCEL');
    expect(repo.getTournament(t.id)?.status).toBe('CANCELLED');
  });
});
