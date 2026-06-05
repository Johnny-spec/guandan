import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * NestJS 生命周期托管的 Prisma 客户端。
 *
 * - `onModuleInit` 主动 `$connect`，让冷启动一次性建立连接（而非首查时）
 * - `onModuleDestroy` 主动 `$disconnect`，避免 e2e / 优雅退出时遗留连接
 * - 通过 PrismaModule 暴露 / 通过 `PrismaService` 直接注入
 *
 * 与 `PrismaMatchRepository` 配合：仓储构造函数接收 PrismaClient（PrismaService 兼容），
 * 既能在 NestModule 中绑定 PrismaService，也能在单元测试中传入 mock。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (err) {
      this.logger.error(
        `Prisma connect failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('Prisma disconnected');
    } catch (err) {
      this.logger.warn(
        `Prisma disconnect failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
