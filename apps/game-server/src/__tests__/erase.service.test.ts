import { beforeEach, describe, expect, it } from 'vitest';
import { EraseError, EraseService } from '../admin/erase.service.js';
import { InMemoryUserPiiSink, shortHash } from '../admin/user-pii.sink.js';

function makeService() {
  const sink = new InMemoryUserPiiSink();
  const service = new EraseService(sink);
  return { sink, service };
}

const REQ = { requestedBy: 'admin-001', reason: 'user request' };

describe('EraseService', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it('anonymizes user, entries, memberships in a single call', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'Alice');
    sink.seedEntry('e1', 'u1', 'Dragons');
    sink.seedEntry('e2', 'u2', 'Tigers', 'u1'); // u1 as partner
    sink.seedMembership('m1', 'u1', 'AliceNick');

    const summary = service.eraseUser('u1', REQ);

    expect(summary.firstTime).toBe(true);
    expect(summary.pseudonym).toBe(`[erased:${shortHash('u1')}]`);
    expect(summary.details).toEqual({
      user: 'anonymized',
      entriesUpdated: 2,
      membershipsUpdated: 1,
    });
    expect(sink.inspectUser('u1')?.displayName).toBe(`[erased:${shortHash('u1')}]`);
    expect(sink.inspectEntry('e1')?.teamName).toBe(`Team-${shortHash('u1')}`);
    expect(sink.inspectEntry('e2')?.partnerUserId).toBeNull();
    expect(sink.inspectMembership('m1')?.nick).toBeNull();
  });

  it('returns 404 EraseError when user does not exist', () => {
    const { service } = ctx;
    expect(() => service.eraseUser('ghost', REQ)).toThrowError(EraseError);
    try {
      service.eraseUser('ghost', REQ);
    } catch (e) {
      expect((e as EraseError).code).toBe('USER_NOT_FOUND');
      expect((e as EraseError).status).toBe(404);
    }
  });

  it('is idempotent: re-erase keeps same pseudonym and reports firstTime=false', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'Alice');
    const a = service.eraseUser('u1', REQ);
    const b = service.eraseUser('u1', { ...REQ, reason: 'monitor recheck' });
    expect(a.pseudonym).toBe(b.pseudonym);
    expect(b.firstTime).toBe(false);
    expect(b.details.user).toBe('already_erased');
  });

  it('appends an audit record for every erase request (including repeats)', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'Alice');
    service.eraseUser('u1', REQ);
    service.eraseUser('u1', { ...REQ, reason: 'recheck' });
    const log = service.listEraseLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.id).not.toBe(log[1]!.id);
    expect(log[0]!.requestedBy).toBe('admin-001');
    expect(log[1]!.reason).toBe('recheck');
  });

  it('listEraseLog supports userId filter', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'A');
    sink.seedUser('u2', 'B');
    service.eraseUser('u1', REQ);
    service.eraseUser('u2', REQ);
    expect(service.listEraseLog({ userId: 'u1' })).toHaveLength(1);
    expect(service.listEraseLog({ userId: 'u2' })).toHaveLength(1);
    expect(service.listEraseLog()).toHaveLength(2);
  });

  it('returned log array is a defensive copy', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'A');
    service.eraseUser('u1', REQ);
    const log = service.listEraseLog();
    log.pop();
    expect(service.listEraseLog()).toHaveLength(1);
  });

  it('rejects empty requestedBy / reason with BAD_REQUEST', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'A');
    expect(() => service.eraseUser('u1', { requestedBy: '', reason: 'x' })).toThrowError(
      EraseError,
    );
    expect(() => service.eraseUser('u1', { requestedBy: 'admin', reason: '   ' })).toThrowError(
      EraseError,
    );
    try {
      service.eraseUser('u1', { requestedBy: '', reason: 'x' });
    } catch (e) {
      expect((e as EraseError).code).toBe('BAD_REQUEST');
      expect((e as EraseError).status).toBe(400);
    }
  });

  it('handles user with no entries / memberships (touched=0)', () => {
    const { sink, service } = ctx;
    sink.seedUser('lonely', 'L');
    const s = service.eraseUser('lonely', REQ);
    expect(s.details.entriesUpdated).toBe(0);
    expect(s.details.membershipsUpdated).toBe(0);
    expect(s.firstTime).toBe(true);
  });

  it('different users get distinct deterministic pseudonyms', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'A');
    sink.seedUser('u2', 'B');
    const a = service.eraseUser('u1', REQ);
    const b = service.eraseUser('u2', REQ);
    expect(a.pseudonym).not.toBe(b.pseudonym);
    expect(a.pseudonym).toBe(`[erased:${shortHash('u1')}]`);
    expect(b.pseudonym).toBe(`[erased:${shortHash('u2')}]`);
  });

  it('shortHash is stable across calls', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'));
    expect(shortHash('abc')).not.toBe(shortHash('abd'));
    expect(shortHash('u1')).toHaveLength(8);
  });

  it('partner reference is wiped even when partner has multiple entries', () => {
    const { sink, service } = ctx;
    sink.seedUser('u1', 'Alice');
    sink.seedEntry('e1', 'u2', 'T1', 'u1');
    sink.seedEntry('e2', 'u3', 'T2', 'u1');
    service.eraseUser('u1', REQ);
    expect(sink.inspectEntry('e1')?.partnerUserId).toBeNull();
    expect(sink.inspectEntry('e2')?.partnerUserId).toBeNull();
  });
});
