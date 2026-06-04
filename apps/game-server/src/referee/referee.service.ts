import { Injectable, Logger } from '@nestjs/common';
import type {
  RefereeAction,
  RefereeActionInput,
  RefereeActionKind,
  RefereeListFilter,
} from './referee.types.js';

const TARGET_REQUIRED: ReadonlySet<RefereeActionKind> = new Set([
  'warn',
  'mute',
  'unmute',
  'kick',
]);

/**
 * 裁判审计 + 角色注册（内存版）。
 *
 * 与 ReplayService / MatchRepository 同样的取舍：当下用 Map，未来切换 Prisma
 * 时实现 `PrismaRefereeRepository`，接口保持 `record / list / role` 三组不变。
 *
 * 不变量：
 *   - `id` 全局单调递增（1-based）
 *   - 同一动作不会被记录两次（调用方应自行去重；本服务不做幂等键）
 *   - 角色注册与动作日志解耦：撤销角色不会回滚历史日志
 */
@Injectable()
export class RefereeService {
  private readonly logger = new Logger(RefereeService.name);
  private readonly actions: RefereeAction[] = [];
  private readonly referees = new Set<string>();

  // -------------------------- 角色 --------------------------

  assignReferee(userId: string): boolean {
    if (!userId) throw new Error('[referee] assignReferee called with empty userId');
    if (this.referees.has(userId)) return false;
    this.referees.add(userId);
    this.logger.log(`[role] assign ${userId}`);
    return true;
  }

  revokeReferee(userId: string): boolean {
    const removed = this.referees.delete(userId);
    if (removed) this.logger.log(`[role] revoke ${userId}`);
    return removed;
  }

  isReferee(userId: string): boolean {
    return this.referees.has(userId);
  }

  listReferees(): readonly string[] {
    return [...this.referees];
  }

  // -------------------------- 审计 --------------------------

  /**
   * 记录裁判动作；调用方需先验证 `isReferee(input.refereeUserId)`，
   * 本方法仅做字段校验（不知道角色注册策略，避免硬编码授权语义）。
   */
  recordAction(input: RefereeActionInput): RefereeAction {
    if (!input.refereeUserId) throw new Error('[referee] refereeUserId required');
    if (!input.roomId) throw new Error('[referee] roomId required');
    if (TARGET_REQUIRED.has(input.kind) && !input.targetUserId) {
      throw new Error(`[referee] kind=${input.kind} requires targetUserId`);
    }
    const action: RefereeAction = {
      id: this.actions.length + 1,
      tsMs: Date.now(),
      refereeUserId: input.refereeUserId,
      kind: input.kind,
      roomId: input.roomId,
      ...(input.matchId ? { matchId: input.matchId } : {}),
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    };
    this.actions.push(action);
    this.logger.log(
      `[action] #${action.id} ${action.refereeUserId} ${action.kind} room=${action.roomId}` +
        (action.targetUserId ? ` target=${action.targetUserId}` : ''),
    );
    return action;
  }

  /** 按过滤条件查询，返回时间倒序（最新在前），limit 默认 100，上限 500。 */
  list(filter: RefereeListFilter = {}): readonly RefereeAction[] {
    const limit = Math.max(1, Math.min(500, filter.limit ?? 100));
    const result: RefereeAction[] = [];
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const a = this.actions[i]!;
      if (filter.roomId && a.roomId !== filter.roomId) continue;
      if (filter.matchId && a.matchId !== filter.matchId) continue;
      if (filter.refereeUserId && a.refereeUserId !== filter.refereeUserId) continue;
      if (filter.targetUserId && a.targetUserId !== filter.targetUserId) continue;
      if (filter.kind && a.kind !== filter.kind) continue;
      if (filter.sinceMs !== undefined && a.tsMs < filter.sinceMs) continue;
      result.push(a);
      if (result.length >= limit) break;
    }
    return result;
  }

  count(): number {
    return this.actions.length;
  }

  /** 仅测试 / dev 用。 */
  clear(): void {
    this.actions.length = 0;
    this.referees.clear();
  }
}
