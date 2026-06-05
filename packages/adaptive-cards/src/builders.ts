/**
 * Adaptive Card 1.5 类型最小子集 —— 仅覆盖本 package 当前生成的字段。
 * 不追求完整 schema 覆盖（避免维护负担），按需扩展。
 */
export interface AdaptiveCard {
  type: 'AdaptiveCard';
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json';
  version: '1.5';
  body: CardElement[];
  actions?: CardAction[];
}

export type CardElement = TextBlock | ColumnSet | FactSet | Container;

export interface TextBlock {
  type: 'TextBlock';
  text: string;
  size?: 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge';
  weight?: 'Lighter' | 'Default' | 'Bolder';
  color?: 'Default' | 'Dark' | 'Light' | 'Accent' | 'Good' | 'Warning' | 'Attention';
  wrap?: boolean;
  isSubtle?: boolean;
  spacing?: 'None' | 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge' | 'Padding';
}

export interface ColumnSet {
  type: 'ColumnSet';
  columns: Array<{ type: 'Column'; width?: string; items: CardElement[] }>;
}

export interface FactSet {
  type: 'FactSet';
  facts: Array<{ title: string; value: string }>;
}

export interface Container {
  type: 'Container';
  style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent';
  items: CardElement[];
}

export interface CardAction {
  type: 'Action.Submit' | 'Action.OpenUrl';
  title: string;
  data?: Record<string, unknown>;
  url?: string;
}

const SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json' as const;
const VERSION = '1.5' as const;

function card(body: CardElement[], actions?: CardAction[]): AdaptiveCard {
  const c: AdaptiveCard = { type: 'AdaptiveCard', $schema: SCHEMA, version: VERSION, body };
  if (actions && actions.length > 0) c.actions = actions;
  return c;
}

// ============================================================
// Welcome card —— 进入 Teams Bot 后的首屏
// ============================================================
export function buildWelcomeCard(): AdaptiveCard {
  return card(
    [
      { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: '掼蛋平台' },
      { type: 'TextBlock', wrap: true, text: '点击下方按钮快速创建房间或加入匹配。' },
    ],
    [
      { type: 'Action.Submit', title: '创建房间', data: { verb: 'createRoom' } },
      { type: 'Action.Submit', title: '快速匹配', data: { verb: 'quickMatch' } },
    ],
  );
}

// ============================================================
// Room created card —— 频道通知：房间已开
// ============================================================
export interface RoomCreatedCardInput {
  roomId: string;
  hostDisplayName: string;
  spectatorCount?: number;
}
export function buildRoomCreatedCard(input: RoomCreatedCardInput): AdaptiveCard {
  const { roomId, hostDisplayName, spectatorCount = 0 } = input;
  return card(
    [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '🎴 新房间已开' },
      {
        type: 'FactSet',
        facts: [
          { title: '房间号', value: roomId },
          { title: '房主', value: hostDisplayName },
          { title: '观战人数', value: String(spectatorCount) },
        ],
      },
    ],
    [
      { type: 'Action.Submit', title: '加入', data: { verb: 'joinRoom', roomId } },
      { type: 'Action.Submit', title: '观战', data: { verb: 'spectateRoom', roomId } },
    ],
  );
}

// ============================================================
// Match finished card —— 一局结束的战报
// ============================================================
export interface MatchFinishedCardInput {
  matchId: string;
  winnerTeam: 'NS' | 'EW';
  endLevel: string;
  durationMs: number;
  /** 可选：包含人类玩家的 rating delta，便于一目了然。 */
  ratingDeltas?: Array<{ displayName: string; delta: number }>;
}
export function buildMatchFinishedCard(input: MatchFinishedCardInput): AdaptiveCard {
  const { matchId, winnerTeam, endLevel, durationMs, ratingDeltas = [] } = input;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  const winnerLabel = winnerTeam === 'NS' ? '南北 (N+S)' : '东西 (E+W)';

  const body: CardElement[] = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: '🏆 对局结束' },
    {
      type: 'FactSet',
      facts: [
        { title: '获胜方', value: winnerLabel },
        { title: '终局打到', value: endLevel },
        { title: '用时', value: `${minutes}分${seconds.toString().padStart(2, '0')}秒` },
      ],
    },
  ];
  if (ratingDeltas.length > 0) {
    body.push({
      type: 'Container',
      style: 'emphasis',
      items: [
        { type: 'TextBlock', weight: 'Bolder', text: '段位变化', spacing: 'Small' },
        {
          type: 'FactSet',
          facts: ratingDeltas.map((d) => ({
            title: d.displayName,
            value: `${d.delta >= 0 ? '+' : ''}${d.delta}`,
          })),
        },
      ],
    });
  }
  return card(body, [
    { type: 'Action.Submit', title: '查看回放', data: { verb: 'viewReplay', matchId } },
  ]);
}

// ============================================================
// Referee action card —— 裁判操作广播
// ============================================================
export type RefereeActionKind = 'warn' | 'mute' | 'unmute' | 'kick' | 'force_end' | 'note';

export interface RefereeActionCardInput {
  kind: RefereeActionKind;
  refereeUserId: string;
  roomId: string;
  targetUserId?: string;
  reason?: string;
}

const KIND_LABEL: Record<RefereeActionKind, string> = {
  warn: '⚠️ 警告',
  mute: '🔇 禁言',
  unmute: '🔊 解除禁言',
  kick: '🚫 踢出房间',
  force_end: '🛑 强制结束对局',
  note: '📝 备注',
};

const KIND_CONTAINER_STYLE: Record<RefereeActionKind, NonNullable<Container['style']>> = {
  warn: 'warning',
  mute: 'attention',
  unmute: 'good',
  kick: 'attention',
  force_end: 'attention',
  note: 'default',
};

export function buildRefereeActionCard(input: RefereeActionCardInput): AdaptiveCard {
  const { kind, refereeUserId, roomId, targetUserId, reason } = input;
  const facts: Array<{ title: string; value: string }> = [
    { title: '裁判', value: refereeUserId },
    { title: '房间号', value: roomId },
  ];
  if (targetUserId) facts.push({ title: '对象', value: targetUserId });
  if (reason) facts.push({ title: '理由', value: reason });

  return card([
    {
      type: 'Container',
      style: KIND_CONTAINER_STYLE[kind],
      items: [
        { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: KIND_LABEL[kind] },
        { type: 'FactSet', facts },
      ],
    },
  ]);
}
