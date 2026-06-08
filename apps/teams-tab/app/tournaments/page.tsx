'use client';

import { useCallback, useEffect, useState } from 'react';
import { GAME_SERVER_URL } from '../../src/lib/dev-token';

interface Tournament {
  id: string;
  name: string;
  hostUserId: string;
  format: string;
  status: 'DRAFT' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  maxTeams: number;
  startLevel: string;
  description: string | null;
  createdAt: string;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export default function TournamentsListPage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOpen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${GAME_SERVER_URL}/api/v1/tournaments?status=OPEN`, { cache: 'no-store' });
      const j = (await r.json()) as Envelope<Tournament[]>;
      setLoading(false);
      if (j.ok) setItems(j.data);
      else setError(`${j.code}: ${j.message}`);
    } catch (e) {
      setLoading(false);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchOpen();
  }, [fetchOpen]);

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={{ margin: 0 }}>赛事大厅 · Tournaments</h1>
        <a href="/" style={link}>← 返回大厅</a>
      </header>
      <p style={hint}>当前开放报名中的赛事，点击 "报名" 加入你的双人战队。</p>

      {error && <div style={errBox}>{error}</div>}

      <button type="button" onClick={fetchOpen} disabled={loading} style={btn}>
        {loading ? '刷新中…' : '刷新'}
      </button>

      {items.length === 0 && !loading ? (
        <div style={empty}>暂无开放报名的赛事。</div>
      ) : (
        <ul style={list}>
          {items.map((t) => (
            <li key={t.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}>{t.name}</h3>
                <span style={badge}>{t.format}</span>
              </div>
              {t.description && <p style={{ margin: '8px 0', color: '#555' }}>{t.description}</p>}
              <div style={meta}>
                主办：{t.hostUserId} · 起始级别：{t.startLevel} · 容量上限：{t.maxTeams}
              </div>
              <div style={{ marginTop: 12 }}>
                <a href={`/tournaments/${encodeURIComponent(t.id)}`} style={btnPrimary}>
                  查看 / 报名 →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const page: React.CSSProperties = { padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 };
const hint: React.CSSProperties = { color: '#666', fontSize: 13, marginBottom: 16 };
const link: React.CSSProperties = { fontSize: 13 };
const errBox: React.CSSProperties = { color: '#dc2626', marginBottom: 12 };
const list: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '16px 0', display: 'grid', gap: 12 };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 };
const badge: React.CSSProperties = {
  background: '#16a34a',
  color: 'white',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
};
const meta: React.CSSProperties = { color: '#666', fontSize: 12, marginTop: 8 };
const empty: React.CSSProperties = { color: '#888', padding: 24, textAlign: 'center', border: '1px dashed #ddd', borderRadius: 8 };
const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  borderRadius: 4,
  background: '#2563eb',
  color: 'white',
  fontSize: 13,
  textDecoration: 'none',
};
