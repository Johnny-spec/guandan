import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PRISMA_CLIENT } from '../match/prisma.match.repository.js';

describe('PrismaService', () => {
  let svc: PrismaService;
  let connectSpy: ReturnType<typeof vi.spyOn>;
  let disconnectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    svc = new PrismaService();
    connectSpy = vi.spyOn(svc, '$connect').mockResolvedValue(undefined);
    disconnectSpy = vi.spyOn(svc, '$disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('onModuleInit 调用 $connect', async () => {
    await svc.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit 失败时抛出（让 Nest 启动失败）', async () => {
    connectSpy.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.onModuleInit()).rejects.toThrow('boom');
  });

  it('onModuleDestroy 调用 $disconnect', async () => {
    await svc.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy 失败不抛（避免阻塞优雅退出）', async () => {
    disconnectSpy.mockRejectedValueOnce(new Error('disc-boom'));
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe('PrismaModule.forRoot', () => {
  const origUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (origUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = origUrl;
    }
  });

  it('DATABASE_URL 未配置时返回空 module（providers/exports 均空）', () => {
    delete process.env.DATABASE_URL;
    const mod = PrismaModule.forRoot();
    expect(mod.providers).toEqual([]);
    expect(mod.exports).toEqual([]);
  });

  it('DATABASE_URL 空字符串视同未配置', () => {
    process.env.DATABASE_URL = '   ';
    const mod = PrismaModule.forRoot();
    expect(mod.providers).toEqual([]);
  });

  it('DATABASE_URL 配置时绑定 PrismaService + PRISMA_CLIENT 别名', () => {
    process.env.DATABASE_URL = 'postgresql://demo';
    const mod = PrismaModule.forRoot();
    expect(mod.providers).toHaveLength(2);
    expect(mod.providers).toContain(PrismaService);
    const alias = (mod.providers as Array<{ provide?: symbol; useExisting?: unknown }>).find(
      (p) => p.provide === PRISMA_CLIENT,
    );
    expect(alias).toBeDefined();
    expect(alias?.useExisting).toBe(PrismaService);
    expect(mod.exports).toContain(PrismaService);
    expect(mod.exports).toContain(PRISMA_CLIENT);
  });
});
