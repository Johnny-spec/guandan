'use client';
import { useState } from 'react';
import { Button, Input, Field } from '@fluentui/react-components';
import { useAuthStore } from '../stores/auth';
import { useRoomStore } from '../stores/room';
import { emitAck, useSocket, getSocket } from '../hooks/use-socket';
import { useEffect } from 'react';

export function Lobby() {
  const { userId, displayName, setUser, logout } = useAuthStore();
  const setRoom = useRoomStore((s) => s.setRoom);
  const showToast = useRoomStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useSocket();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    if (s.connected) setConnected(true);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [userId]);

  if (!userId) {
    return (
      <div style={{ maxWidth: 420, margin: '64px auto', padding: 16 }}>
        <h2>登录（Dev）</h2>
        <p style={{ color: '#666' }}>
          Phase 1 使用本地昵称登录。Phase 2 将接入 Teams SSO（Entra ID）。
        </p>
        <Field label="昵称">
          <Input
            value={name}
            onChange={(_, d) => setName(d.value)}
            placeholder="例如 alice"
          />
        </Field>
        <Button
          appearance="primary"
          style={{ marginTop: 12 }}
          disabled={!name.trim()}
          onClick={() => {
            const trimmed = name.trim();
            const id = trimmed.toLowerCase().replace(/\s+/g, '-');
            setUser(id, trimmed);
          }}
        >
          进入大厅
        </Button>
      </div>
    );
  }

  const onCreate = async () => {
    setBusy(true);
    try {
      const r = await emitAck<'room:create', { id: string }>(
        'room:create',
        { visibility: 'public' },
      );
      if (!r.ok) {
        showToast('error', `${r.code}: ${r.message}`);
        return;
      }
      // room:updated 事件会同步到 store；用 r.data.id 直接跳转
      const roomId = (r.data as { id: string }).id;
      window.location.href = `/room/${roomId}`;
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    const id = joinId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const r = await emitAck('room:join', { roomId: id });
      if (!r.ok) {
        showToast('error', `${r.code}: ${r.message}`);
        return;
      }
      window.location.href = `/room/${id}`;
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSpectate = async () => {
    const id = joinId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const r = await emitAck('spectate:join', { roomId: id });
      if (!r.ok) {
        showToast('error', `${r.code}: ${r.message}`);
        return;
      }
      window.location.href = `/spectate/${id}`;
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          掼蛋大厅 · {displayName}
          <span
            style={{
              marginLeft: 12,
              fontSize: 12,
              color: connected ? '#107c10' : '#d13438',
            }}
          >
            ● {connected ? '已连接' : '未连接'}
          </span>
        </h2>
        <Button onClick={() => { setRoom(null); logout(); }}>登出</Button>
      </div>

      <nav style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 14 }}>
        <a href="/profile">我的战绩</a>
        <a href="/leaderboard">排行榜</a>
      </nav>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>创建房间</h3>
          <p style={{ color: '#666', fontSize: 13 }}>
            创建后会成为房主，等 4 人入座后可"开始游戏"。
          </p>
          <Button appearance="primary" disabled={!connected || busy} onClick={onCreate}>
            创建公开房间
          </Button>
        </div>
        <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>加入房间</h3>
          <Field label="房间号">
            <Input
              value={joinId}
              onChange={(_, d) => setJoinId(d.value)}
              placeholder="例如 f590da3c"
            />
          </Field>
          <Button
            style={{ marginTop: 8 }}
            disabled={!connected || !joinId.trim() || busy}
            onClick={onJoin}
          >
            加入
          </Button>
          <Button
            style={{ marginTop: 8, marginLeft: 8 }}
            disabled={!connected || !joinId.trim() || busy}
            onClick={onSpectate}
          >
            观战
          </Button>
        </div>
      </div>

      <p style={{ marginTop: 24, color: '#888', fontSize: 12 }}>
        服务端：<code>{process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001'}</code>
        ，开 4 个浏览器窗口（不同昵称）即可联机对战。
      </p>
    </div>
  );
}
