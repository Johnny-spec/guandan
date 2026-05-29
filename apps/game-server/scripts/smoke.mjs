// Smoke test: 4 dev clients create+join a room, start a game, and exchange events.
// Run with: node scripts/smoke.mjs   (server must be on :3001)
import { io } from 'socket.io-client';

function devToken(userId, displayName) {
  return 'dev:' + Buffer.from(JSON.stringify({ userId, displayName }), 'utf8').toString('base64');
}

function connect(userId, displayName) {
  const s = io('http://localhost:3001/game', {
    transports: ['websocket'],
    auth: { token: devToken(userId, displayName) },
  });
  s.on('connect', () => console.log(`[${userId}] connected sid=${s.id}`));
  s.on('connect_error', (e) => console.log(`[${userId}] CONNECT ERROR`, e.message));
  s.on('room:updated', (r) => {
    const occ = Object.entries(r.seats).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(',');
    console.log(`[${userId}] room:updated id=${r.id} phase=${r.phase} seats={${occ}}`);
  });
  s.on('game:state', (snap) => {
    console.log(`[${userId}] game:state phase=${snap.public.phase} turn=${snap.public.turnSeat} myHand=${snap.private.cardIds.length}`);
  });
  s.on('game:played', (p) => console.log(`[${userId}] game:played seat=${p.seat} count=${p.cardIds.length}`));
  return s;
}

function ackTimeout(emit, ms = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ack timeout')), ms);
    emit((res) => { clearTimeout(t); resolve(res); });
  });
}

async function main() {
  const alice = connect('alice', 'Alice');
  const bob = connect('bob', 'Bob');
  const carol = connect('carol', 'Carol');
  const dan = connect('dan', 'Dan');

  await new Promise((r) => setTimeout(r, 600));

  const r1 = await ackTimeout((cb) => alice.emit('room:create', { visibility: 'public' }, cb));
  console.log('CREATE →', JSON.stringify(r1));
  if (!r1.ok) process.exit(1);
  const roomId = r1.data.id;

  for (const [name, s] of [['bob', bob], ['carol', carol], ['dan', dan]]) {
    const r = await ackTimeout((cb) => s.emit('room:join', { roomId }, cb));
    console.log(`JOIN ${name} →`, r.ok ? 'ok' : JSON.stringify(r));
  }

  const start = await ackTimeout((cb) => alice.emit('game:start', { roomId }, cb));
  console.log('START →', JSON.stringify(start));

  await new Promise((r) => setTimeout(r, 400));

  const bad = await ackTimeout((cb) => alice.emit('game:play', { roomId, cardIds: ['S-3-0', 'H-4-0'] }, cb));
  console.log('BAD PLAY →', JSON.stringify(bad));

  const wrongTurn = await ackTimeout((cb) => bob.emit('game:play', { roomId, cardIds: ['S-3-0'] }, cb));
  console.log('OUT-OF-TURN →', JSON.stringify(wrongTurn));

  const t = await new Promise((res) => alice.emit('ping', res));
  console.log('PING →', t);

  await new Promise((r) => setTimeout(r, 200));
  for (const s of [alice, bob, carol, dan]) s.close();
  console.log('DONE');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
