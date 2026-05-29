// 简易并发压测：N 个用户每人创建房间 + 3 bots 玩一局，统计 RTT。
// 用法： node tests/load/socket-load.mjs --url=http://localhost:3001 --users=20 --duration=60
import { io } from 'socket.io-client';
import { performance } from 'node:perf_hooks';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const URL = args.url ?? 'http://localhost:3001';
const USERS = Number(args.users ?? 10);
const DURATION_MS = Number(args.duration ?? 30) * 1000;

function devToken(userId, displayName) {
  return 'dev:' + Buffer.from(JSON.stringify({ userId, displayName }), 'utf8').toString('base64');
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx];
}

function ack(emit, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const t = setTimeout(() => reject(new Error('ack timeout')), ms);
    emit((res) => {
      clearTimeout(t);
      resolve({ res, rttMs: performance.now() - t0 });
    });
  });
}

async function runUser(i, deadline, stats) {
  const userId = `loadbot-${i}`;
  const s = io(`${URL}/game`, {
    transports: ['websocket'],
    auth: { token: devToken(userId, `Load ${i}`) },
    forceNew: true,
  });
  let mySeat = null;
  let hand = [];
  let turnSeat = null;
  let hasTop = false;
  let games = 0;
  let plays = 0;
  let finished = false;

  s.on('game:state', (snap) => {
    mySeat = snap.private.seat;
    hand = snap.private.cardIds;
    turnSeat = snap.public.turnSeat;
    hasTop = !!snap.public.currentTrickTop;
  });
  s.on('game:played', () => { plays += 1; });
  s.on('game:finished', () => { finished = true; games += 1; });

  await new Promise((r, j) => { s.once('connect', r); s.once('connect_error', j); });

  while (performance.now() < deadline) {
    finished = false;
    const create = await ack((cb) => s.emit('room:create', { visibility: 'public' }, cb));
    stats.rtt.push(create.rttMs);
    if (!create.res?.ok) break;
    const roomId = create.res.data.id;

    for (const difficulty of ['easy', 'normal', 'hard']) {
      const r = await ack((cb) => s.emit('bot:add', { roomId, difficulty }, cb));
      stats.rtt.push(r.rttMs);
    }
    const start = await ack((cb) => s.emit('game:start', { roomId }, cb));
    stats.rtt.push(start.rttMs);

    const gameDeadline = Math.min(deadline, performance.now() + 40_000);
    while (!finished && performance.now() < gameDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      if (turnSeat === mySeat && hand.length > 0) {
        const r = await ack((cb) => s.emit('game:play', { roomId, cardIds: [hand[0]] }, cb));
        stats.rtt.push(r.rttMs);
        if (!r.res?.ok && hasTop) {
          const p = await ack((cb) => s.emit('game:pass', { roomId }, cb));
          stats.rtt.push(p.rttMs);
        }
      }
    }
  }
  s.close();
  return { games, plays };
}

async function main() {
  console.log(`[load] url=${URL} users=${USERS} duration=${DURATION_MS / 1000}s`);
  const stats = { rtt: [], errors: 0 };
  const deadline = performance.now() + DURATION_MS;
  const results = await Promise.allSettled(
    Array.from({ length: USERS }, (_, i) => runUser(i, deadline, stats)),
  );
  const sorted = [...stats.rtt].sort((a, b) => a - b);
  const games = results.reduce((a, r) => a + (r.status === 'fulfilled' ? r.value.games : 0), 0);
  const plays = results.reduce((a, r) => a + (r.status === 'fulfilled' ? r.value.plays : 0), 0);
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.log('--- SUMMARY ---');
  console.log(`users:        ${USERS} (failed=${failed})`);
  console.log(`games done:   ${games}`);
  console.log(`plays:        ${plays}`);
  console.log(`ack samples:  ${sorted.length}`);
  console.log(`rtt p50:      ${quantile(sorted, 0.5).toFixed(1)} ms`);
  console.log(`rtt p95:      ${quantile(sorted, 0.95).toFixed(1)} ms`);
  console.log(`rtt p99:      ${quantile(sorted, 0.99).toFixed(1)} ms`);
  console.log(`rtt max:      ${(sorted[sorted.length - 1] ?? 0).toFixed(1)} ms`);
  const p95 = quantile(sorted, 0.95);
  if (failed > 0 || p95 > 500) {
    console.error(`SLO violated (failed=${failed}, p95=${p95.toFixed(1)}ms > 500ms)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
