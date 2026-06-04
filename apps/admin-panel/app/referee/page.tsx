'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../../src/lib/api';

type Kind = 'warn' | 'mute' | 'unmute' | 'kick' | 'force_end' | 'note';

interface RefereeAction {
  id: number;
  tsMs: number;
  refereeUserId: string;
  kind: Kind;
  roomId: string;
  matchId?: string;
  targetUserId?: string;
  reason?: string;
}

const KIND_COLOR: Record<Kind, string> = {
  warn: '#f59e0b',
  mute: '#dc2626',
  unmute: '#16a34a',
  kick: '#7c2d12',
  force_end: '#7c3aed',
  note: '#64748b',
};

const ALL_KINDS: Kind[] = ['warn', 'mute', 'unmute', 'kick', 'force_end', 'note'];

export default function RefereePage() {
  const [referees, setReferees] = useState<string[]>([]);
  const [actions, setActions] = useState<RefereeAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [roomId, setRoomId] = useState('');
  const [refereeUserId, setRefereeUserId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [kind, setKind] = useState<Kind | ''>('');
  const [limit, setLimit] = useState('100');

  // role mgmt
  const [newReferee, setNewReferee] = useState('');

  const fetchRoles = useCallback(async () => {
    const r = await apiGet<{ referees: string[] }>('/api/v1/referee/roles');
    if (r.ok) setReferees(r.data.referees);
  }, []);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (roomId.trim()) qs.set('roomId', roomId.trim());
    if (refereeUserId.trim()) qs.set('refereeUserId', refereeUserId.trim());
    if (targetUserId.trim()) qs.set('targetUserId', targetUserId.trim());
    if (kind) qs.set('kind', kind);
    if (limit.trim()) qs.set('limit', limit.trim());
    const r = await apiGet<RefereeAction[]>(`/api/v1/referee/actions?${qs.toString()}`);
    setLoading(false);
    if (r.ok) setActions(r.data);
    else setError(`${r.code}: ${r.message}`);
  }, [roomId, refereeUserId, targetUserId, kind, limit]);

  useEffect(() => {
    fetchRoles();
    fetchActions();
  }, [fetchRoles, fetchActions]);

  const onAssign = async () => {
    const id = newReferee.trim();
    if (!id) return;
    const r = await apiSend<{ userId: string; created: boolean }>(
      'POST',
      `/api/v1/referee/roles/${encodeURIComponent(id)}`,
    );
    if (r.ok) {
      setNewReferee('');
      await fetchRoles();
    } else {
      setError(`${r.code}: ${r.message}`);
    }
  };

  const onRevoke = async (id: string) => {
    const r = await apiSend('DELETE', `/api/v1/referee/roles/${encodeURIComponent(id)}`);
    if (r.ok) await fetchRoles();
    else setError(`${r.code}: ${r.message}`);
  };

  const onReset = () => {
    setRoomId('');
    setRefereeUserId('');
    setTargetUserId('');
    setKind('');
    setLimit('100');
  };

  const totalByKind = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of actions) m[a.kind] = (m[a.kind] ?? 0) + 1;
    return m;
  }, [actions]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>裁判审计 · Referee Audit</h1>
        <a href="/" style={{ fontSize: 13 }}>← 返回首页</a>
      </header>

      {/* ---- 角色管理 ---- */}
      <section style={section}>
        <h2 style={h2}>裁判角色（{referees.length}）</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {referees.length === 0 && <span style={{ color: '#888' }}>暂无授权裁判。</span>}
          {referees.map((id) => (
            <span key={id} style={chip}>
              {id}
              <button type="button" onClick={() => onRevoke(id)} style={chipBtn} title="撤销裁判角色">
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            value={newReferee}
            onChange={(e) => setNewReferee(e.target.value)}
            placeholder="userId 例：admin1"
            style={input}
          />
          <button type="button" onClick={onAssign} style={btnPrimary} disabled={!newReferee.trim()}>
            授权裁判
          </button>
        </div>
      </section>

      {/* ---- 过滤器 ---- */}
      <section style={section}>
        <h2 style={h2}>审计日志过滤</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <Labeled label="roomId">
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} style={input} />
          </Labeled>
          <Labeled label="refereeUserId">
            <input value={refereeUserId} onChange={(e) => setRefereeUserId(e.target.value)} style={input} />
          </Labeled>
          <Labeled label="targetUserId">
            <input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={input} />
          </Labeled>
          <Labeled label="kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind | '')} style={input}>
              <option value="">全部</option>
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="limit">
            <input value={limit} onChange={(e) => setLimit(e.target.value)} style={input} />
          </Labeled>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" onClick={fetchActions} style={btnPrimary} disabled={loading}>
            {loading ? '查询中…' : '查询'}
          </button>
          <button type="button" onClick={onReset} style={btn}>
            重置
          </button>
        </div>
      </section>

      {/* ---- 结果 ---- */}
      <section style={section}>
        <h2 style={h2}>
          结果：{actions.length} 条
          {Object.keys(totalByKind).length > 0 && (
            <span style={{ marginLeft: 12, fontSize: 13, color: '#666', fontWeight: 'normal' }}>
              （
              {Object.entries(totalByKind)
                .map(([k, n]) => `${k}:${n}`)
                .join(' / ')}
              ）
            </span>
          )}
        </h2>
        {error && (
          <div style={{ color: '#dc2626', marginBottom: 8 }}>错误：{error}</div>
        )}
        {actions.length === 0 ? (
          <div style={{ color: '#888' }}>无数据。</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={th}>#</th>
                <th style={th}>时间</th>
                <th style={th}>kind</th>
                <th style={th}>roomId</th>
                <th style={th}>裁判</th>
                <th style={th}>目标</th>
                <th style={th}>matchId</th>
                <th style={th}>理由</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}>{a.id}</td>
                  <td style={td}>{new Date(a.tsMs).toLocaleString()}</td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: KIND_COLOR[a.kind],
                        color: 'white',
                        fontSize: 11,
                      }}
                    >
                      {a.kind}
                    </span>
                  </td>
                  <td style={td}>
                    <code>{a.roomId}</code>
                  </td>
                  <td style={td}>{a.refereeUserId}</td>
                  <td style={td}>{a.targetUserId ?? '—'}</td>
                  <td style={td}>{a.matchId ?? '—'}</td>
                  <td style={td}>{a.reason ?? ''}</td>
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

const section: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
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
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#2563eb',
  color: 'white',
  border: '1px solid #2563eb',
};
const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  background: '#eef2ff',
  border: '1px solid #c7d2fe',
  borderRadius: 12,
  fontSize: 12,
};
const chipBtn: React.CSSProperties = {
  marginLeft: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  color: '#4338ca',
};
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
