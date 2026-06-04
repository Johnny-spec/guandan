/**
 * 裁判（Referee）审计模块类型。
 *
 * Phase 3 内存版：先建接口与领域类型，Postgres 阶段实现 `PrismaRefereeRepository`，
 * 接口保持 append / list 不变。
 */

export type RefereeActionKind =
  | 'warn'        // 口头警告 / 提示
  | 'mute'        // 禁言
  | 'unmute'      // 解禁
  | 'kick'        // 踢出房间
  | 'force_end'   // 强制结束当前对局
  | 'note';       // 一般性裁判备注（不针对单个目标也合法）

export interface RefereeAction {
  /** 单调递增的审计序号（1-based，全局，不按房间/对局分桶）。 */
  id: number;
  /** 行为发生时间。 */
  tsMs: number;
  /** 操作裁判的 userId。 */
  refereeUserId: string;
  /** 操作类型。 */
  kind: RefereeActionKind;
  /** 关联房间（必填，所有裁判动作都发生在某房间上下文中）。 */
  roomId: string;
  /** 关联对局（可选，比如裁判在两局之间做事时缺失）。 */
  matchId?: string;
  /** 被处置的目标用户（warn/mute/unmute/kick 必填；force_end/note 可空）。 */
  targetUserId?: string;
  /** 人类可读理由（可空，但强烈建议填写）。 */
  reason?: string;
}

export interface RefereeActionInput {
  refereeUserId: string;
  kind: RefereeActionKind;
  roomId: string;
  matchId?: string;
  targetUserId?: string;
  reason?: string;
}

export interface RefereeListFilter {
  roomId?: string;
  matchId?: string;
  refereeUserId?: string;
  targetUserId?: string;
  kind?: RefereeActionKind;
  /** 仅返回 tsMs >= sinceMs 的事件。 */
  sinceMs?: number;
  limit?: number;
}
