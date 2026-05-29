'use client';
import type { PlayerSnapshot, Seat } from '@teams-guandan/shared-types';

interface Props {
  seat: Seat;
  player: PlayerSnapshot | undefined;
  isTurn: boolean;
  isMe: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  onRemoveBot?: (botUserId: string) => void;
  canManageBot?: boolean;
}

const POS_STYLE: Record<Props['position'], React.CSSProperties> = {
  top: { gridArea: 'top', justifySelf: 'center' },
  bottom: { gridArea: 'bottom', justifySelf: 'center' },
  left: { gridArea: 'left', alignSelf: 'center' },
  right: { gridArea: 'right', alignSelf: 'center' },
};

export function SeatBadge({ seat, player, isTurn, isMe, position, onRemoveBot, canManageBot }: Props) {
  const isBot = !!player?.isBot;
  return (
    <div
      style={{
        ...POS_STYLE[position],
        padding: '8px 12px',
        borderRadius: 8,
        background: isTurn ? '#fff4ce' : 'white',
        border: isTurn ? '2px solid #f7a600' : '1px solid #ddd',
        minWidth: 110,
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,.1)',
      }}
    >
      <div style={{ fontSize: 12, color: '#666' }}>
        {seat}
        {isMe ? ' (你)' : ''}
      </div>
      <div style={{ fontWeight: 600, marginTop: 2 }}>
        {isBot ? `🤖 ${player?.botDifficulty ?? 'bot'}` : (player?.userId ?? '空位')}
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
        {player ? `${player.handCount} 张` : '—'}
        {player?.isOffline ? ' · 离线' : ''}
        {player?.isAuto ? ' · 托管' : ''}
      </div>
      {isBot && canManageBot && onRemoveBot && player && (
        <button
          onClick={() => onRemoveBot(player.userId)}
          style={{
            marginTop: 6,
            fontSize: 11,
            border: '1px solid #ccc',
            background: 'white',
            cursor: 'pointer',
            borderRadius: 4,
            padding: '2px 6px',
          }}
        >
          移除
        </button>
      )}
    </div>
  );
}

