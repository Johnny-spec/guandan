'use client';
import { useMemo, useState } from 'react';
import { Button } from '@fluentui/react-components';
import type { GameStateSnapshot, RoomDetail, Seat } from '@teams-guandan/shared-types';
import { Card } from './Card';
import { SeatBadge } from './SeatBadge';
import { emitAck } from '../hooks/use-socket';
import { useRoomStore } from '../stores/room';
import { useAuthStore } from '../stores/auth';

interface Props {
  room: RoomDetail;
  snapshot: GameStateSnapshot | null;
}

const SEAT_ORDER: Seat[] = ['N', 'E', 'S', 'W'];

/** 把座位映射到屏幕方位：自己永远在 bottom。 */
function relativePos(seat: Seat, me: Seat | null): 'top' | 'bottom' | 'left' | 'right' {
  if (!me) return seat === 'N' ? 'top' : seat === 'S' ? 'bottom' : seat === 'E' ? 'right' : 'left';
  const off = (SEAT_ORDER.indexOf(seat) - SEAT_ORDER.indexOf(me) + 4) % 4;
  const order = ['bottom', 'left', 'top', 'right'] as const;
  return order[off] ?? 'top';
}

export function GameTable({ room, snapshot }: Props) {
  const userId = useAuthStore((s) => s.userId);
  const showToast = useRoomStore((s) => s.showToast);
  const lastPlay = useRoomStore((s) => s.lastPlay);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const mySeat = snapshot?.private.seat ?? null;
  const myHand = snapshot?.private.cardIds ?? [];
  const isMyTurn = !!mySeat && snapshot?.public.turnSeat === mySeat;
  const isPlaying = room.phase === 'playing';
  const isHost = room.hostUserId === userId;
  const canStart = !isPlaying &&
    SEAT_ORDER.every((s) => room.seats[s]) &&
    isHost;

  const playersBySeat = useMemo(() => {
    const m = new Map<Seat, (typeof room.players)[number]>();
    for (const p of room.players) m.set(p.seat, p);
    return m;
  }, [room.players]);

  const toggle = (cardId: string) => {
    if (!isMyTurn) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const onStart = async () => {
    setBusy(true);
    try {
      const r = await emitAck('game:start', { roomId: room.id });
      if (!r.ok) showToast('error', `${r.code}: ${r.message}`);
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPlay = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await emitAck('game:play', {
        roomId: room.id,
        cardIds: [...selected],
      });
      if (!r.ok) showToast('error', `${r.code}: ${r.message}`);
      else setSelected(new Set());
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPass = async () => {
    setBusy(true);
    try {
      const r = await emitAck('game:pass', { roomId: room.id });
      if (!r.ok) showToast('error', `${r.code}: ${r.message}`);
      else setSelected(new Set());
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    setBusy(true);
    try {
      await emitAck('room:leave', { roomId: room.id });
      // page-level effect handles redirect via useRoomStore.room === null
      useRoomStore.getState().setRoom(null);
      useRoomStore.getState().setSnapshot(null);
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  };

  const onAddBot = async (difficulty: 'easy' | 'normal' | 'hard') => {
    setBusy(true);
    try {
      const r = await emitAck('bot:add', { roomId: room.id, difficulty });
      if (!r.ok) showToast('error', `${r.code}: ${r.message}`);
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemoveBot = async (botUserId: string) => {
    setBusy(true);
    try {
      const r = await emitAck('bot:remove', { roomId: room.id, botUserId });
      if (!r.ok) showToast('error', `${r.code}: ${r.message}`);
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <strong>房间 {room.id}</strong>
          <span style={{ marginLeft: 12, color: '#666' }}>
            阶段：{room.phase} · 级牌：{room.level}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isPlaying && isHost && room.players.length < 4 && (
            <>
              <Button onClick={() => onAddBot('easy')} disabled={busy}>
                +简单Bot
              </Button>
              <Button onClick={() => onAddBot('normal')} disabled={busy}>
                +普通Bot
              </Button>
              <Button onClick={() => onAddBot('hard')} disabled={busy}>
                +困难Bot
              </Button>
            </>
          )}
          {canStart && (
            <Button appearance="primary" onClick={onStart} disabled={busy}>
              开始游戏
            </Button>
          )}
          <Button onClick={onLeave} disabled={busy}>
            离开
          </Button>
        </div>
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
            isTurn={snapshot?.public.turnSeat === s}
            isMe={mySeat === s}
            position={relativePos(s, mySeat)}
            canManageBot={!isPlaying && isHost}
            onRemoveBot={onRemoveBot}
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
              {isPlaying ? '等待出牌…' : '等待开局…'}
            </span>
          )}
        </div>
      </div>

      {mySeat && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>我的手牌（{myHand.length}）{isMyTurn ? ' — 你的回合' : ''}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                appearance="primary"
                disabled={!isMyTurn || selected.size === 0 || busy}
                onClick={onPlay}
              >
                出牌（{selected.size}）
              </Button>
              <Button
                disabled={
                  !isMyTurn ||
                  busy ||
                  // 首出/新墩不允许 pass
                  !snapshot?.public.currentTrickTop
                }
                onClick={onPass}
              >
                过
              </Button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', paddingLeft: 8, minHeight: 80 }}>
            {[...myHand]
              .sort()
              .map((c) => (
                <Card
                  key={c}
                  cardId={c}
                  selected={selected.has(c)}
                  onClick={() => toggle(c)}
                />
              ))}
          </div>
        </div>
      )}

      {!mySeat && (
        <div style={{ marginTop: 24, color: '#666' }}>你是观战者（尚未入座）。</div>
      )}
    </div>
  );
}
