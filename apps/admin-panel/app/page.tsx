export default function AdminHome() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>掼蛋平台 · 管理后台</h1>
      <p>骨架页面 — Phase 3 接入用户管理 / 举报 / 封禁 / 赛事配置。</p>
      <nav style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <a href="/referee">裁判审计</a>
      </nav>
    </main>
  );
}
