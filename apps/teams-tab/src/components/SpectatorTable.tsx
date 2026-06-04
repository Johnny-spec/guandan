'use client';
import { useMemo } from 'react';
import { Button } from '@fluentui/react-components';
import type { RoomDetail, Seat } from '@teams-guandan/shared-types';
import { Card } from './Card';
import { SeatBadge } from './SeatBadge';
import { emitAck } from '../hooks/use-socket';
import { useRoomStore } from '../stores/room';

interface Props {
  room: RoomDetail;
}

const SEAT_ORDER: Seat[] = ['N', 'E', 'S', 'W'];

/**
 * 观战视角：与 GameTable 同款牌桌布局，但
 * - 无手牌 / 出牌按钮（spectator 不接收 game:state）
 * - 离开调用 spectate:leave 而非 room:leave
 * - 中央仅展示最近一次公开出牌（来自 game:played 广播）
 */
export function SpectatorTable({ room }: Props) {
  const lastPlay = useRoomStore((s) => s.lastPlay);
  const showToast = useRoomStore((s) => s.showToast);
  const setRoom = useRoomStore((s) => s.setRoom);
  const setLastPlay = useRoomStore((s) => s.setLastPlay);

  const playersBySeat = useMemo(() => {
    const m = new Map<Seat, (typeof room.players)[number]>();
    for (const p of room.players) m.set(p.seat, p);
    return m;
  }, [room.players]);

  const onLeave = async () => {
    try {
      await emitAck('spectate:leave', { roomId: room.id });
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setRoom(null);
      setLastPlay(null);
      window.location.href = '/';
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <strong>观战 · 房间 {room.id}</strong>
          <span style={{ marginLeft: 12, color: '#666' }}>
            阶段：{room.phase} · 级牌：{room.level} · 观战 {room.spectatorIds?.length ?? 0} 人
          </span>
        </div>
        <Button onClick={onLeave}>退出观战</Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateAreas: '". top ." "left center right" ". bottom ."',
          gridTemplateColumns: '1fr 2fr 1fr',
          gridTemplateRows: 'auto 200px auto',
          gap: 12,
          background: '#0a7d3a',
          borderRadius: 12,
          padding: 16,
          color: 'white',
        }}
      >
        {SEAT_ORDER.map((s) => (
          <SeatBadge
            key={s}
            seat={s}
            player={playersBySeat.get(s)}
            isTurn={false}
            isMe={false}
            position={
              s === 'N' ? 'top' : s === 'S' ? 'bottom' : s === 'E' ? 'right' : 'left'
            }
          />
        ))}
        <div
          style={{
            gridArea: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.18)',
            borderRadius: 8,
            minHeight: 100,
          }}
        >
          {lastPlay ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: 12, fontSize: 12 }}>{lastPlay.seat} 出：</span>
              {lastPlay.cardIds.map((c) => (
                <Card key={c} cardId={c} />
              ))}
            </div>
          ) : (
            <span style={{ opacity: 0.7 }}>
              {room.phase === 'playing' ? '等待出牌…' : '等待开局…'}
            </span>
          )}
        </div>
      </div>

      <p style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
        观战模式：仅接收公开广播（出牌 / 过 / 收墩 / 胜负），看不到任何玩家的手牌。
      </p>
    </div>
  );
}
