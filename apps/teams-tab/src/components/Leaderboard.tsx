'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { api, type LeaderboardDto } from '../lib/api';

export function Leaderboard() {
  const { userId } = useAuthStore();
  const [rows, setRows] = useState<LeaderboardDto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.leaderboard(100);
    if (r.ok) setRows(r.data);
    else setErr(`${r.code}: ${r.message}`);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
      <nav style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <a href="/">← 大厅</a>
        <a href="/profile">我的战绩</a>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </nav>
      <h2>排行榜</h2>
      {err && <p style={{ color: '#d13438' }}>{err}</p>}
      {rows.length === 0 ? (
        <p style={{ color: '#666' }}>尚无玩家上榜，先去打两局吧。</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              <th style={th}>#</th>
              <th style={th}>玩家</th>
              <th style={th}>评分</th>
              <th style={th}>胜</th>
              <th style={th}>总</th>
              <th style={th}>胜率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const wr = e.matchesTotal > 0 ? Math.round((e.matchesWon / e.matchesTotal) * 100) : 0;
              return (
                <tr
                  key={e.userId}
                  style={{
                    borderTop: '1px solid #eee',
                    background: e.userId === userId ? '#fff4ce' : undefined,
                  }}
                >
                  <td style={td}>{e.rank}</td>
                  <td style={td}>{e.displayName}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{e.rating}</td>
                  <td style={td}>{e.matchesWon}</td>
                  <td style={td}>{e.matchesTotal}</td>
                  <td style={td}>{wr}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 12px' };
