import { Global, Module, type DynamicModule, type Provider } from '@nestjs/common';
import { PRISMA_CLIENT } from '../match/prisma.match.repository.js';
import { PrismaService } from './prisma.service.js';

/**
 * 全局 Prisma 模块。
 *
 * 用法：
 *   - 在 AppModule.imports 顶端调用 `PrismaModule.forRoot()`
 *   - 内部按 `DATABASE_URL` env 自动启停：
 *       - 未配置 → 模块为空（不绑定 PrismaService，避免冷启动连接失败）
 *       - 已配置 → 绑定 PrismaService + PRISMA_CLIENT 别名（与 PrismaMatchRepository 对齐）
 *   - 配合 `@Optional() @Inject(PRISMA_CLIENT)` 让消费者无 DB 也可启动
 *
 * 设计权衡：保留 env-gated 行为而非强制 DATABASE_URL，是因为：
 *   1) 既有 155 测试不依赖 DB；
 *   2) Phase 2 / 3 还在 InMemory 仓储期并行；
 *   3) 生产 / dev 通过环境变量切换，零代码改动。
 */
@Global()
@Module({})
export class PrismaModule {
  static forRoot(): DynamicModule {
    const enabled =
      typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() !== '';
    if (!enabled) {
      return {
        module: PrismaModule,
        providers: [],
        exports: [],
      };
    }
    const providers: Provider[] = [
      PrismaService,
      { provide: PRISMA_CLIENT, useExisting: PrismaService },
    ];
    return {
      module: PrismaModule,
      providers,
      exports: [PrismaService, PRISMA_CLIENT],
    };
  }
}
