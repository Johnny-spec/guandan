// Mock Microsoft Graph + Teams SSO 端点。本地无外网也能调通鉴权链路。
// 用法： node tests/mock/teams-graph.mjs --port=4400
import http from 'node:http';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const PORT = Number(args.port ?? 4400);

const ROUTES = {
  'GET /v1.0/me': () => ({
    id: 'mock-user-001',
    displayName: 'Mock User',
    userPrincipalName: 'mock@example.com',
    mail: 'mock@example.com',
  }),
  'GET /v1.0/me/joinedTeams': () => ({ value: [{ id: 'team-1', displayName: 'Mock Team' }] }),
  'POST /common/oauth2/v2.0/token': () => ({
    token_type: 'Bearer',
    access_token: 'mock.access.token',
    id_token: 'mock.id.token',
    expires_in: 3600,
  }),
  'GET /.well-known/openid-configuration': () => ({
    issuer: `http://127.0.0.1:${PORT}`,
    jwks_uri: `http://127.0.0.1:${PORT}/discovery/v2.0/keys`,
    token_endpoint: `http://127.0.0.1:${PORT}/common/oauth2/v2.0/token`,
  }),
  'GET /discovery/v2.0/keys': () => ({ keys: [] }),
};

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url?.split('?')[0]}`;
  const handler = ROUTES[key];
  res.setHeader('content-type', 'application/json');
  if (!handler) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found', path: key }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const payload = handler(body ? JSON.parse(body) : undefined);
      res.statusCode = 200;
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[mock-graph] listening on http://127.0.0.1:${PORT}`);
  console.log('routes:', Object.keys(ROUTES));
});
