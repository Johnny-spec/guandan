import { Inject, Injectable, Optional } from '@nestjs/common';
import { USER_PII_SINK, type UserPiiSink } from './user-pii.sink.js';

/**
 * Phase 4 Sprint 2 · DSR Erase Service。
 *
 * 通过 `UserPiiSink` 串联所有持 PII 的子系统，按"匿名化优先于删除"的策略执行被遗忘权请求；
 * 每次成功执行追加一条 `ErasureRecord` 审计日志（内存版；线上换 Postgres 审计表）。
 *
 * 路由由 `AdminController` 暴露为 `POST /api/v1/admin/users/:userId/erase`，
 * 真正部署时上游 API 网关再叠加 AAD 管理员组校验（本 Sprint 不实现鉴权）。
 */

export interface EraseRequestInput {
  /** 谁发起的删除（管理员 oid 或服务账号）。审计必填。 */
  requestedBy: string;
  /** 删除原因（用户主动请求 / 监管要求 / 合规审计 ...）。审计必填。 */
  reason: string;
}

export interface ErasureSummary {
  /** 目标 userId。 */
  userId: string;
  /** 是否首次成功 erase（false = idempotent 命中已 erase 的记录）。 */
  firstTime: boolean;
  /** 匿名化后的 pseudonym。 */
  pseudonym: string;
  /** 各子系统受影响行数 / 状态。 */
  details: {
    user: 'anonymized' | 'already_erased';
    entriesUpdated: number;
    membershipsUpdated: number;
  };
}

export interface ErasureRecord extends ErasureSummary {
  id: string;
  requestedBy: string;
  reason: string;
  erasedAt: string;
}

export class EraseError extends Error {
  constructor(
    readonly code: 'USER_NOT_FOUND' | 'BAD_REQUEST',
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'EraseError';
  }
}

@Injectable()
export class EraseService {
  private readonly log: ErasureRecord[] = [];
  private counter = 1;

  constructor(@Optional() @Inject(USER_PII_SINK) private readonly sink: UserPiiSink) {
    if (!sink) {
      throw new Error('EraseService requires a UserPiiSink provider');
    }
  }

  /**
   * 执行擦除。
   * - 用户不存在 → 抛 `USER_NOT_FOUND`（避免暴露存在性给非管理员场景，但当前 endpoint 只挂 admin 路由）。
   * - 已 erase → 仍然写一条审计（监管口径：每次请求都需留痕），summary.firstTime=false。
   */
  eraseUser(userId: string, input: EraseRequestInput): ErasureSummary {
    if (!userId || userId.trim() === '') {
      throw new EraseError('BAD_REQUEST', 'userId is required');
    }
    if (!input?.requestedBy || input.requestedBy.trim() === '') {
      throw new EraseError('BAD_REQUEST', 'requestedBy is required');
    }
    if (!input?.reason || input.reason.trim() === '') {
      throw new EraseError('BAD_REQUEST', 'reason is required');
    }

    const result = this.sink.anonymizeUser(userId);
    if (!result) {
      throw new EraseError('USER_NOT_FOUND', `User ${userId} not found`, 404);
    }
    // 关联表的匿名化即使在 already_erased 路径下也安全（幂等：count=0）。
    const entriesUpdated = this.sink.anonymizeTeamEntries(userId);
    const membershipsUpdated = this.sink.anonymizeGuildMemberships(userId);

    const summary: ErasureSummary = {
      userId,
      firstTime: !result.alreadyErased,
      pseudonym: result.pseudonym,
      details: {
        user: result.alreadyErased ? 'already_erased' : 'anonymized',
        entriesUpdated,
        membershipsUpdated,
      },
    };
    this.log.push({
      ...summary,
      id: `erase_${this.counter++}`,
      requestedBy: input.requestedBy,
      reason: input.reason,
      erasedAt: new Date().toISOString(),
    });
    return summary;
  }

  /** 列出审计日志（最新在后）。 */
  listEraseLog(filter?: { userId?: string }): ErasureRecord[] {
    if (!filter?.userId) return [...this.log];
    return this.log.filter((r) => r.userId === filter.userId);
  }
}
