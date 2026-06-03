'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ReplayBundleDto, type ReplayEventDto } from '../lib/api';

const SEAT_COLOR: Record<string, string> = {
  N: '#0078d4',
  E: '#107c10',
  S: '#d83b01',
  W: '#5c2d91',
};

function fmtSeat(seat: unknown): string {
  return typeof seat === 'string' ? seat : '?';
}

function fmtTs(tsMs: number, originMs: number | null): string {
  if (!originMs) return new Date(tsMs).toLocaleTimeString();
  const delta = Math.max(0, tsMs - originMs);
  const sec = (delta / 1000).toFixed(1);
  return `+${sec}s`;
}

function describe(evt: ReplayEventDto): { icon: string; title: string; detail: string } {
  switch (evt.kind) {
    case 'match_start': {
      const seats = Array.isArray(evt.payload['seats']) ? (evt.payload['seats'] as Array<{ seat: string; displayName: string; isBot: boolean }>) : [];
      const level = String(evt.payload['startLevel'] ?? '?');
      return {
        icon: '🟢',
        title: `对局开始（级牌 ${level}）`,
        detail: seats.map((s) => `${s.seat}=${s.displayName}${s.isBot ? '(bot)' : ''}`).join(' · '),
      };
    }
    case 'play': {
      const seat = fmtSeat(evt.payload['seat']);
      const cards = Array.isArray(evt.payload['cardIds']) ? (evt.payload['cardIds'] as string[]) : [];
      return { icon: '🃏', title: `${seat} 出牌`, detail: cards.length ? cards.join(' · ') : '(空)' };
    }
    case 'pass':
      return { icon: '⏭️', title: `${fmtSeat(evt.payload['seat'])} 过`, detail: '' };
    case 'trick_closed':
      return { icon: '🔒', title: '本墩结束', detail: `下一个出牌：${fmtSeat(evt.payload['lead'])}` };
    case 'match_finish': {
      const winner = String(evt.payload['winnerTeam'] ?? '?');
      const end = String(evt.payload['endLevel'] ?? '?');
      const dur = Number(evt.payload['durationMs'] ?? 0);
      return {
        icon: '🏆',
        title: `${winner} 获胜（升至 ${end}）`,
        detail: `时长 ${(dur / 1000).toFixed(1)}s`,
      };
    }
  }
}

export function ReplayPlayer({ matchId }: { matchId: string }) {
  const [bundle, setBundle] = useState<ReplayBundleDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0); // 当前已"播放"到的事件 index（exclusive 上界 = cursor）
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const r = await api.getReplay(matchId);
      if (!mounted) return;
      if (!r.ok) {
        setErr(`${r.code}: ${r.message}`);
      } else {
        setBundle(r.data);
        setCursor(r.data.events.length); // 默认全展开（用户更常想看全程，再倒退 step）
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [matchId]);

  const events = bundle?.events ?? [];
  const total = events.length;
  const origin = bundle?.meta.startedAtMs ?? events[0]?.tsMs ?? null;

  // 自动播放：每 step 推进 1，到末尾停止
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!playing || cursor >= total) return;
    const intervalMs = Math.max(120, 800 / speed);
    timerRef.current = setTimeout(() => {
      setCursor((c) => Math.min(total, c + 1));
    }, intervalMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, cursor, total, speed]);

  useEffect(() => {
    if (cursor >= total) setPlaying(false);
  }, [cursor, total]);

  const visible = useMemo(() => events.slice(0, cursor), [events, cursor]);

  if (loading) return <p style={{ padding: 16 }}>加载回放中…</p>;
  if (err) return <p style={{ padding: 16, color: '#d13438' }}>加载失败：{err}</p>;
  if (!bundle) return <p style={{ padding: 16 }}>无数据</p>;
  if (total === 0) {
    return (
      <div style={{ padding: 16 }}>
        <nav style={{ marginBottom: 16 }}>
          <a href="/profile">← 战绩</a>
        </nav>
        <h2>回放 · {matchId}</h2>
        <p style={{ color: '#666' }}>这局没有记录到事件（可能是历史对局，未启用 Replay）。</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: 16 }}>
      <nav style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <a href="/">← 大厅</a>
        <a href="/profile">战绩</a>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
          {bundle.meta.eventCount} 条事件 ·{' '}
          {bundle.meta.finishedAtMs ? '已结束' : '进行中'}
        </span>
      </nav>

      <h2 style={{ marginBottom: 4 }}>回放</h2>
      <div style={{ color: '#666', fontSize: 13, marginBottom: 16, wordBreak: 'break-all' }}>
        matchId: <code>{matchId}</code>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: 12,
          background: '#f5f5f5',
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <button onClick={() => setCursor(0)} disabled={cursor === 0}>
          ⏮ 开始
        </button>
        <button onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0}>
          ◀ 上一步
        </button>
        <button onClick={() => setPlaying((p) => !p)} disabled={cursor >= total}>
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button onClick={() => setCursor((c) => Math.min(total, c + 1))} disabled={cursor >= total}>
          下一步 ▶
        </button>
        <button onClick={() => setCursor(total)} disabled={cursor >= total}>
          末尾 ⏭
        </button>
        <label style={{ marginLeft: 12, fontSize: 13 }}>
          速度：
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#333' }}>
          {cursor} / {total}
        </span>
      </div>

      <div
        style={{
          height: 6,
          background: '#eee',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: total > 0 ? `${(cursor / total) * 100}%` : '0%',
            height: '100%',
            background: '#0078d4',
            transition: 'width 0.15s linear',
          }}
        />
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {visible.map((evt) => {
          const d = describe(evt);
          const seat = typeof evt.payload['seat'] === 'string' ? (evt.payload['seat'] as string) : null;
          const accent = seat ? SEAT_COLOR[seat] ?? '#999' : '#999';
          return (
            <li
              key={evt.seq}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '8px 12px',
                borderLeft: `3px solid ${accent}`,
                marginBottom: 4,
                background: '#fafafa',
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: 18 }}>{d.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  <span style={{ color: '#888', fontWeight: 400, fontSize: 12, marginRight: 6 }}>
                    #{evt.seq}
                  </span>
                  {d.title}
                </div>
                {d.detail && (
                  <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{d.detail}</div>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#888' }}>{fmtTs(evt.tsMs, origin)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
