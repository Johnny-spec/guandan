import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayEvent } from './replay.types.js';

/**
 * 回放事件存储抽象。
 *
 * 设计原则：
 *   - 仅存"已发生的事实"，不负责生成 seq / tsMs（由 ReplayService 在写入前赋值）
 *   - append 必须保证持久顺序：append(seq=N) 必须晚于 append(seq=N-1) 落盘
 *   - list 必须按 append 顺序返回
 *   - clear 仅用于测试 / dev 重置；生产路径不应调用
 */
export interface ReplayStore {
  append(matchId: string, event: ReplayEvent): void;
  list(matchId: string): readonly ReplayEvent[];
  clear(matchId?: string): void;
}

/**
 * 内存版（默认）。语义等同 Phase 3 Sprint 2 之前的 ReplayService.events Map。
 */
export class InMemoryReplayStore implements ReplayStore {
  private readonly events = new Map<string, ReplayEvent[]>();

  append(matchId: string, event: ReplayEvent): void {
    const list = this.events.get(matchId) ?? [];
    list.push(event);
    this.events.set(matchId, list);
  }

  list(matchId: string): readonly ReplayEvent[] {
    return this.events.get(matchId) ?? [];
  }

  clear(matchId?: string): void {
    if (matchId) this.events.delete(matchId);
    else this.events.clear();
  }
}

/**
 * 文件版（JSONL：一行一个事件，append-only）。
 *
 * 文件布局：`${baseDir}/${matchId}.jsonl`
 *
 * 不变量：
 *   - 每个 matchId 一个文件；文件名校验 `/^[A-Za-z0-9_-]+$/`，防注入
 *   - 写入用 `appendFileSync`（同步），事件量极小（~百级 / 局），换取顺序保证
 *   - 读取：首次 list() 时从文件懒加载到内存缓存，之后 append 同步写入文件 + 缓存
 *
 * 接 Phase 3 后期 Postgres 时实现 `PrismaReplayStore`，接口完全一致。
 */
export class JsonlReplayStore implements ReplayStore {
  private readonly cache = new Map<string, ReplayEvent[]>();
  /** 已尝试从磁盘加载过的 matchId（无论是否存在文件）。 */
  private readonly loaded = new Set<string>();

  constructor(private readonly baseDir: string) {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
  }

  private static isSafeId(matchId: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(matchId);
  }

  private filePath(matchId: string): string {
    if (!JsonlReplayStore.isSafeId(matchId)) {
      throw new Error(`[replay] unsafe matchId for file path: ${matchId}`);
    }
    return join(this.baseDir, `${matchId}.jsonl`);
  }

  private ensureLoaded(matchId: string): ReplayEvent[] {
    if (this.loaded.has(matchId)) {
      return this.cache.get(matchId) ?? [];
    }
    const fp = this.filePath(matchId);
    const list: ReplayEvent[] = [];
    if (existsSync(fp)) {
      const raw = readFileSync(fp, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          list.push(JSON.parse(trimmed) as ReplayEvent);
        } catch {
          // 损坏行跳过（不应发生：append 单行原子）
        }
      }
    }
    this.cache.set(matchId, list);
    this.loaded.add(matchId);
    return list;
  }

  append(matchId: string, event: ReplayEvent): void {
    const list = this.ensureLoaded(matchId);
    list.push(event);
    appendFileSync(this.filePath(matchId), `${JSON.stringify(event)}\n`, 'utf8');
  }

  list(matchId: string): readonly ReplayEvent[] {
    return this.ensureLoaded(matchId);
  }

  clear(matchId?: string): void {
    if (matchId) {
      this.cache.delete(matchId);
      this.loaded.delete(matchId);
      const fp = this.filePath(matchId);
      if (existsSync(fp)) unlinkSync(fp);
      return;
    }
    this.cache.clear();
    this.loaded.clear();
    if (existsSync(this.baseDir)) {
      for (const entry of readdirSync(this.baseDir)) {
        if (entry.endsWith('.jsonl')) {
          unlinkSync(join(this.baseDir, entry));
        }
      }
    }
  }
}

/** Nest provider 注入 token。 */
export const REPLAY_STORE = Symbol('REPLAY_STORE');
