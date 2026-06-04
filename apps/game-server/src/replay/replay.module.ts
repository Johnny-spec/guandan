import { Module } from '@nestjs/common';
import { ReplayService } from './replay.service.js';
import { ReplayController } from './replay.controller.js';
import { InMemoryReplayStore, JsonlReplayStore, REPLAY_STORE, type ReplayStore } from './replay.store.js';

/**
 * 选择 ReplayStore 实现：
 *   - 设置环境变量 `REPLAY_DIR=<path>` → 启用 JSONL 文件持久化（重启后回放仍可访问）
 *   - 否则 → 默认内存版（重启即清空）
 */
function createReplayStore(): ReplayStore {
  const dir = process.env.REPLAY_DIR?.trim();
  if (dir) {
    return new JsonlReplayStore(dir);
  }
  return new InMemoryReplayStore();
}

@Module({
  providers: [
    ReplayService,
    {
      provide: REPLAY_STORE,
      useFactory: createReplayStore,
    },
  ],
  controllers: [ReplayController],
  exports: [ReplayService],
})
export class ReplayModule {}
