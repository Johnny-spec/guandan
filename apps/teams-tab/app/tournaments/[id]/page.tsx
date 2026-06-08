'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { GAME_SERVER_URL } from '../../../src/lib/dev-token';
import { useAuthStore } from '../../../src/stores/auth';

interface Tournament {
  id: string;
  name: string;
  hostUserId: string;
  format: string;
  status: 'DRAFT' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  maxTeams: number;
  startLevel: string;
  description: string | null;
}

interface Entry {
  id: string;
  captainUserId: string;
  partnerUserId: string | null;
  teamName: string;
  seed: number | null;
  status: 'PENDING' | 'CONFIRMED' | 'WITHDRAWN' | 'KICKED';
  registeredAt: string;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function getJson<T>(path: string): Promise<Envelope<T>> {
  try {
    const r = await fetch(`${GAME_SERVER_URL}${path}`, { cache: 'no-store' });
    return (await r.json()) as Envelope<T>;
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error).message };
  }
}

async function postJson<T>(path: string, body?: unknown): Promise<Envelope<T>> {
  try {
    const r = await fetch(`${GAME_SERVER_URL}${path}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return (await r.json()) as Envelope<T>;
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error).message };
  }
}

export default function TournamentRegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const captainId = useAuthStore((s) => s.userId) ?? '';

  const [t, setT] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [partnerUserId, setPartnerUserId] = useState('');

  const refresh = useCallback(async () => {
    const [t1, e1] = await Promise.all([
      getJson<Tournament>(`/api/v1/tournaments/${encodeURIComponent(id)}`),
      getJson<Entry[]>(`/api/v1/tournaments/${encodeURIComponent(id)}/entries`),
    ]);
    if (t1.ok) setT(t1.data); else setError(`${t1.code}: ${t1.message}`);
    if (e1.ok) setEntries(e1.data);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const myEntry = entries.find((e) => e.captainUserId === captainId && e.status !== 'WITHDRAWN' && e.status !== 'KICKED');
  const activeCount = entries.filter((e) => e.status !== 'WITHDRAWN' && e.status !== 'KICKED').length;
  const isFull = t ? activeCount >= t.maxTeams : false;
  const canRegister = !!t && t.status === 'OPEN' && !myEntry && !isFull && !!captainId;

  const onRegister = async () => {
    if (!captainId || !teamName.trim()) {
      setError('请先登录并填写队名');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const r = await postJson<Entry>(`/api/v1/tournaments/${encodeURIComponent(id)}/entries`, {
      captainUserId: captainId,
      teamName: teamName.trim(),
      partnerUserId: partnerUserId.trim() || null,
    });
    setSubmitting(false);
    if (r.ok) {
      setSuccess(`报名成功！队伍 ID：${r.data.id}`);
      setTeamName('');
      setPartnerUserId('');
      await refresh();
    } else {
      setError(`${r.code}: ${r.message}`);
    }
  };

  const onWithdraw = async () => {
    if (!myEntry) return;
    if (!confirm('确定退赛？')) return;
    const r = await postJson(`/api/v1/tournament-entries/${encodeURIComponent(myEntry.id)}/withdraw`);
    if (!r.ok) setError(`${r.code}: ${r.message}`);
    else setSuccess('已退赛');
    await refresh();
  };

  if (!t) return <main style={page}>{error ?? '加载中…'}</main>;

  return (
    <main style={page}>
      <header style={header}>
        <h1 style={{ margin: 0 }}>{t.name}</h1>
        <a href="/tournaments" style={{ fontSize: 13 }}>← 赛事列表</a>
      </header>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={h2}>赛事信息</h2>
          <span style={statusBadge(t.status)}>{t.status}</span>
        </div>
        {t.description && <p style={{ color: '#555', marginTop: 0 }}>{t.description}</p>}
        <ul style={{ fontSize: 13, color: '#444', paddingLeft: 20, margin: '8px 0' }}>
          <li>赛制：{t.format}</li>
          <li>起始级别：{t.startLevel}</li>
          <li>报名情况：{activeCount} / {t.maxTeams}</li>
          <li>主办：{t.hostUserId}</li>
        </ul>
      </section>

      {error && <div style={errBox}>{error}</div>}
      {success && <div style={okBox}>{success}</div>}

      {!captainId && (
        <div style={card}>
          <h2 style={h2}>请先登录</h2>
          <p style={{ color: '#555' }}>报名前请先在大厅完成登录（Teams 用户身份将作为队长）。</p>
        </div>
      )}

      {myEntry ? (
        <section style={card}>
          <h2 style={h2}>我的报名</h2>
          <dl style={dlGrid}>
            <dt style={dt}>队名</dt><dd style={dd}>{myEntry.teamName}</dd>
            <dt style={dt}>状态</dt><dd style={dd}>{myEntry.status}</dd>
            <dt style={dt}>队友</dt><dd style={dd}>{myEntry.partnerUserId ?? '— (待邀请)'}</dd>
            <dt style={dt}>报名时间</dt><dd style={dd}>{new Date(myEntry.registeredAt).toLocaleString()}</dd>
          </dl>
          <button type="button" style={btnDanger} onClick={onWithdraw}>退赛</button>
        </section>
      ) : (
        <section style={card}>
          <h2 style={h2}>报名战队</h2>
          {!canRegister && captainId && (
            <p style={{ color: '#dc2626', fontSize: 13 }}>
              {t.status !== 'OPEN' ? `当前状态 ${t.status}，未开放报名。` : isFull ? '报名已满。' : ''}
            </p>
          )}
          <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
            <Labeled label="队长 (我)">
              <input value={captainId} disabled style={input} />
            </Labeled>
            <Labeled label="队名 *">
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} style={input} placeholder="敢死队" />
            </Labeled>
            <Labeled label="队友 userId（可空，留空后再邀请）">
              <input value={partnerUserId} onChange={(e) => setPartnerUserId(e.target.value)} style={input} placeholder="user_b" />
            </Labeled>
            <button
              type="button"
              style={btnPrimary}
              onClick={onRegister}
              disabled={submitting || !canRegister || !teamName.trim()}
            >
              {submitting ? '报名中…' : '提交报名'}
            </button>
          </div>
        </section>
      )}
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

const page: React.CSSProperties = { padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15 };
const dlGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, fontSize: 13, margin: 0 };
const dt: React.CSSProperties = { color: '#666', margin: 0 };
const dd: React.CSSProperties = { margin: 0 };
const input: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 4,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#dc2626', border: '1px solid #dc2626' };
const errBox: React.CSSProperties = { color: '#dc2626', marginBottom: 12, padding: 8, background: '#fef2f2', borderRadius: 4 };
const okBox: React.CSSProperties = { color: '#15803d', marginBottom: 12, padding: 8, background: '#f0fdf4', borderRadius: 4 };

function statusBadge(s: Tournament['status']): React.CSSProperties {
  const color = s === 'OPEN' ? '#16a34a' : s === 'RUNNING' ? '#2563eb' : s === 'FINISHED' ? '#7c3aed' : s === 'CANCELLED' ? '#dc2626' : '#64748b';
  return { background: color, color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 11 };
}
