'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../src/lib/api';

type TournamentStatus = 'DRAFT' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
type EntryStatus = 'PENDING' | 'CONFIRMED' | 'WITHDRAWN' | 'KICKED';

interface Tournament {
  id: string;
  name: string;
  hostUserId: string;
  format: string;
  status: TournamentStatus;
  maxTeams: number;
  startLevel: string;
  description: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface Entry {
  id: string;
  tournamentId: string;
  captainUserId: string;
  partnerUserId: string | null;
  teamName: string;
  seed: number | null;
  status: EntryStatus;
  registeredAt: string;
}

const ACTIONS: Array<{ key: string; label: string; from: TournamentStatus[] }> = [
  { key: 'open', label: '开放报名', from: ['DRAFT'] },
  { key: 'close', label: '关闭报名', from: ['OPEN'] },
  { key: 'start', label: '开始', from: ['OPEN'] },
  { key: 'finish', label: '结束', from: ['RUNNING'] },
  { key: 'cancel', label: '取消', from: ['DRAFT', 'OPEN', 'RUNNING'] },
];

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [t, setT] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [t1, e1] = await Promise.all([
      apiGet<Tournament>(`/api/v1/tournaments/${encodeURIComponent(id)}`),
      apiGet<Entry[]>(`/api/v1/tournaments/${encodeURIComponent(id)}/entries`),
    ]);
    if (t1.ok) setT(t1.data); else setError(`${t1.code}: ${t1.message}`);
    if (e1.ok) setEntries(e1.data); else setError(`${e1.code}: ${e1.message}`);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onLifecycle = async (action: string) => {
    setBusy(true);
    const r = await apiSend('POST', `/api/v1/tournaments/${encodeURIComponent(id)}/${action}`);
    setBusy(false);
    if (!r.ok) setError(`${r.code}: ${r.message}`);
    await refresh();
  };

  const onEntryAction = async (entryId: string, action: 'withdraw' | 'confirm' | 'kick') => {
    const r = await apiSend('POST', `/api/v1/tournament-entries/${encodeURIComponent(entryId)}/${action}`);
    if (!r.ok) setError(`${r.code}: ${r.message}`);
    await refresh();
  };

  if (!t) return <main style={{ padding: 24 }}>{error ?? '加载中…'}</main>;

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>{t.name}</h1>
        <a href="/tournaments" style={{ fontSize: 13 }}>← 返回列表</a>
      </header>
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <section style={section}>
        <h2 style={h2}>基本信息</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6, fontSize: 13, margin: 0 }}>
          <dt style={dt}>ID</dt><dd style={dd}><code>{t.id}</code></dd>
          <dt style={dt}>状态</dt><dd style={dd}><b>{t.status}</b></dd>
          <dt style={dt}>赛制</dt><dd style={dd}>{t.format}</dd>
          <dt style={dt}>主办</dt><dd style={dd}>{t.hostUserId}</dd>
          <dt style={dt}>容量</dt><dd style={dd}>{entries.filter((e) => e.status !== 'WITHDRAWN' && e.status !== 'KICKED').length} / {t.maxTeams}</dd>
          <dt style={dt}>起始级别</dt><dd style={dd}>{t.startLevel}</dd>
          <dt style={dt}>描述</dt><dd style={dd}>{t.description ?? '—'}</dd>
          <dt style={dt}>开始</dt><dd style={dd}>{t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}</dd>
          <dt style={dt}>结束</dt><dd style={dd}>{t.finishedAt ? new Date(t.finishedAt).toLocaleString() : '—'}</dd>
        </dl>
      </section>

      <section style={section}>
        <h2 style={h2}>生命周期</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onLifecycle(a.key)}
              disabled={busy || !a.from.includes(t.status)}
              style={a.key === 'cancel' ? btnDanger : btnPrimary}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>报名队伍（{entries.length}）</h2>
        {entries.length === 0 ? (
          <div style={{ color: '#888' }}>暂无报名。</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={th}>队名</th>
                <th style={th}>状态</th>
                <th style={th}>队长</th>
                <th style={th}>队友</th>
                <th style={th}>seed</th>
                <th style={th}>报名时间</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}>{e.teamName}</td>
                  <td style={td}>{e.status}</td>
                  <td style={td}>{e.captainUserId}</td>
                  <td style={td}>{e.partnerUserId ?? '—'}</td>
                  <td style={td}>{e.seed ?? '—'}</td>
                  <td style={td}>{new Date(e.registeredAt).toLocaleString()}</td>
                  <td style={td}>
                    {e.status === 'PENDING' && (
                      <button type="button" style={btnSm} onClick={() => onEntryAction(e.id, 'confirm')}>确认</button>
                    )}
                    {(e.status === 'PENDING' || e.status === 'CONFIRMED') && (
                      <>
                        <button type="button" style={btnSm} onClick={() => onEntryAction(e.id, 'withdraw')}>退赛</button>
                        <button type="button" style={{ ...btnSm, color: '#dc2626' }} onClick={() => onEntryAction(e.id, 'kick')}>移除</button>
                      </>
                    )}
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

const section: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15 };
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#dc2626', border: '1px solid #dc2626' };
const btnSm: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontSize: 12,
  marginRight: 4,
};
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const dt: React.CSSProperties = { color: '#666', margin: 0 };
const dd: React.CSSProperties = { margin: 0 };
