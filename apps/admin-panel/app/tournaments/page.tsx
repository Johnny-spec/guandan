'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../src/lib/api';

type TournamentStatus = 'DRAFT' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
type TournamentFormat = 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'SWISS' | 'ROUND_ROBIN';

interface Tournament {
  id: string;
  name: string;
  hostUserId: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxTeams: number;
  startLevel: string;
  description: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<TournamentStatus, string> = {
  DRAFT: '#64748b',
  OPEN: '#16a34a',
  RUNNING: '#2563eb',
  FINISHED: '#7c3aed',
  CANCELLED: '#dc2626',
};

export default function TournamentsPage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TournamentStatus | ''>('');

  const [name, setName] = useState('');
  const [hostUserId, setHostUserId] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('SINGLE_ELIM');
  const [maxTeams, setMaxTeams] = useState('16');
  const [startLevel, setStartLevel] = useState('2');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = filterStatus ? `?status=${filterStatus}` : '';
    const r = await apiGet<Tournament[]>(`/api/v1/tournaments${qs}`);
    setLoading(false);
    if (r.ok) setItems(r.data);
    else setError(`${r.code}: ${r.message}`);
  }, [filterStatus]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onCreate = async () => {
    if (!name.trim() || !hostUserId.trim()) return;
    setCreating(true);
    const r = await apiSend<Tournament>('POST', '/api/v1/tournaments', {
      name: name.trim(),
      hostUserId: hostUserId.trim(),
      format,
      maxTeams: Number(maxTeams),
      startLevel: startLevel.trim() || '2',
      description: description.trim() || null,
    });
    setCreating(false);
    if (r.ok) {
      setName('');
      setDescription('');
      await fetchList();
    } else {
      setError(`${r.code}: ${r.message}`);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>赛事管理 · Tournaments</h1>
        <a href="/" style={{ fontSize: 13 }}>← 返回首页</a>
      </header>

      <section style={section}>
        <h2 style={h2}>创建新赛事</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <Labeled label="赛事名称 *">
            <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="春季杯" />
          </Labeled>
          <Labeled label="主办人 userId *">
            <input value={hostUserId} onChange={(e) => setHostUserId(e.target.value)} style={input} placeholder="admin1" />
          </Labeled>
          <Labeled label="赛制">
            <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} style={input}>
              <option value="SINGLE_ELIM">单淘汰</option>
              <option value="DOUBLE_ELIM">双败淘汰</option>
              <option value="SWISS">瑞士轮</option>
              <option value="ROUND_ROBIN">循环赛</option>
            </select>
          </Labeled>
          <Labeled label="最大队伍数 (2-256)">
            <input value={maxTeams} onChange={(e) => setMaxTeams(e.target.value)} style={input} type="number" min={2} max={256} />
          </Labeled>
          <Labeled label="起始级别">
            <input value={startLevel} onChange={(e) => setStartLevel(e.target.value)} style={input} placeholder="2" />
          </Labeled>
          <Labeled label="描述">
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={input} />
          </Labeled>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onCreate} style={btnPrimary} disabled={creating || !name.trim() || !hostUserId.trim()}>
            {creating ? '创建中…' : '创建赛事'}
          </button>
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>
          赛事列表（{items.length}）
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TournamentStatus | '')}
            style={{ ...input, width: 160, marginLeft: 12, display: 'inline-block', fontSize: 12 }}
          >
            <option value="">全部状态</option>
            <option value="DRAFT">DRAFT</option>
            <option value="OPEN">OPEN</option>
            <option value="RUNNING">RUNNING</option>
            <option value="FINISHED">FINISHED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <button type="button" onClick={fetchList} style={{ ...btn, marginLeft: 8 }} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </h2>
        {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
        {items.length === 0 ? (
          <div style={{ color: '#888' }}>无赛事。</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={th}>名称</th>
                <th style={th}>状态</th>
                <th style={th}>赛制</th>
                <th style={th}>主办</th>
                <th style={th}>容量</th>
                <th style={th}>创建时间</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}>{t.name}</td>
                  <td style={td}>
                    <span style={{ ...statusBadge, background: STATUS_COLOR[t.status] }}>{t.status}</span>
                  </td>
                  <td style={td}>{t.format}</td>
                  <td style={td}>{t.hostUserId}</td>
                  <td style={td}>{t.maxTeams}</td>
                  <td style={td}>{new Date(t.createdAt).toLocaleString()}</td>
                  <td style={td}>
                    <a href={`/tournaments/${encodeURIComponent(t.id)}`} style={{ fontSize: 12 }}>详情 →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#555' }}>
      {label}
      {children}
    </label>
  );
}

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15 };
const input: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontSize: 13,
};
const btnPrimary: React.CSSProperties = { ...btn, background: '#2563eb', color: 'white', border: '1px solid #2563eb' };
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const statusBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  color: 'white',
  fontSize: 11,
};
