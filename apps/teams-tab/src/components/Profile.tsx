'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { api, type LeaderboardDto, type MatchDto, type UserDto } from '../lib/api';

function timeAgo(iso: string | null): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s 前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m 前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h 前`;
  return `${Math.round(hr / 24)}d 前`;
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '-';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

export function Profile() {
  const { userId, displayName } = useAuthStore();
  const [me, setMe] = useState<UserDto | null>(null);
  const [matches, setMatches] = useState<MatchDto[]>([]);
  const [lb, setLb] = useState<LeaderboardDto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    const [u, m, l] = await Promise.all([
      api.getUser(userId),
      api.listMatches(userId, 20),
      api.leaderboard(20),
    ]);
    if (u.ok) setMe(u.data);
    else if (u.code !== 'USER_NOT_FOUND') setErr(`${u.code}: ${u.message}`);
    else setMe(null);
    if (m.ok) setMatches(m.data);
    else setErr((e) => e ?? `${m.code}: ${m.message}`);
    if (l.ok) setLb(l.data);
    else setErr((e) => e ?? `${l.code}: ${l.message}`);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId) {
    return (
      <div style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
        <p>请先在<a href="/">大厅</a>登录。</p>
      </div>
    );
  }

  const winRate = me && me.matchesTotal > 0 ? Math.round((me.matchesWon / me.matchesTotal) * 100) : 0;

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: 16 }}>
      <nav style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <a href="/">← 大厅</a>
        <a href="/leaderboard">排行榜</a>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </nav>

      <h2>战绩 · {displayName}</h2>

      {err && <p style={{ color: '#d13438' }}>错误：{err}</p>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Card label="评分" value={me?.rating ?? '—'} />
        <Card label="对局" value={me?.matchesTotal ?? 0} />
        <Card label="胜场" value={me?.matchesWon ?? 0} />
        <Card label="胜率" value={`${winRate}%`} />
      </section>

      <h3>最近 20 场</h3>
      {matches.length === 0 ? (
        <p style={{ color: '#666' }}>还没有对局记录。回大厅开一局吧。</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              <th style={th}>时间</th>
              <th style={th}>类型</th>
              <th style={th}>结果</th>
              <th style={th}>队友</th>
              <th style={th}>对手</th>
              <th style={th}>评分</th>
              <th style={th}>时长</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const me2 = m.players.find((p) => p.userId === userId)!;
              const won = m.winnerTeam === me2.team;
              const teammates = m.players.filter((p) => p.team === me2.team && p.userId !== userId);
              const opponents = m.players.filter((p) => p.team !== me2.team);
              return (
                <tr key={m.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={td}>{timeAgo(m.startedAt)}</td>
                  <td style={td}>{m.kind === 'AI_TRAINING' ? '人机' : m.kind === 'CASUAL' ? '休闲' : m.kind}</td>
                  <td style={{ ...td, color: won ? '#107c10' : '#d13438', fontWeight: 600 }}>
                    {won ? '胜' : '负'}
                  </td>
                  <td style={td}>{teammates.map((p) => p.displayName).join(', ')}</td>
                  <td style={td}>{opponents.map((p) => p.displayName).join(', ')}</td>
                  <td style={{ ...td, color: (me2.ratingDelta ?? 0) >= 0 ? '#107c10' : '#d13438' }}>
                    {me2.ratingDelta !== undefined
                      ? `${me2.ratingDelta >= 0 ? '+' : ''}${me2.ratingDelta}`
                      : '—'}
                  </td>
                  <td style={td}>{fmtDuration(m.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 32 }}>排行榜 Top 20</h3>
      {lb.length === 0 ? (
        <p style={{ color: '#666' }}>排行榜为空。</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              <th style={th}>#</th>
              <th style={th}>玩家</th>
              <th style={th}>评分</th>
              <th style={th}>胜/总</th>
            </tr>
          </thead>
          <tbody>
            {lb.map((e) => (
              <tr
                key={e.userId}
                style={{
                  borderTop: '1px solid #eee',
                  background: e.userId === userId ? '#fff4ce' : undefined,
                }}
              >
                <td style={td}>{e.rank}</td>
                <td style={td}>{e.displayName}</td>
                <td style={td}>{e.rating}</td>
                <td style={td}>
                  {e.matchesWon}/{e.matchesTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 12px' };

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <div style={{ color: '#666', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
