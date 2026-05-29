import { describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service.js';

describe('AuthService', () => {
  const svc = new AuthService();

  it('rejects empty token', () => {
    expect(svc.verify(undefined)).toBeNull();
    expect(svc.verify('')).toBeNull();
  });

  it('rejects bad token format', () => {
    expect(svc.verify('garbage')).toBeNull();
    expect(svc.verify('dev:%%%')).toBeNull();
  });

  it('accepts dev token with userId + displayName', () => {
    const t = AuthService.makeDevToken('u1', 'Alice');
    const u = svc.verify(t);
    expect(u).not.toBeNull();
    expect(u!.userId).toBe('u1');
    expect(u!.displayName).toBe('Alice');
    expect(u!.source).toBe('dev');
  });

  it('rejects dev token missing fields', () => {
    const t = 'dev:' + Buffer.from(JSON.stringify({ userId: 'u1' }), 'utf8').toString('base64');
    expect(svc.verify(t)).toBeNull();
  });
});
