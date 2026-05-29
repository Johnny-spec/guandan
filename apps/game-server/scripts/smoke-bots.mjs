// 1 human + 3 bots smoke. Watches the game progress autonomously.
// Run with: node scripts/smoke-bots.mjs  (server must be on :3001)
import { io } from 'socket.io-client';

function devToken(userId, displayName) {
  return 'dev:' + Buffer.from(JSON.stringify({ userId, displayName }), 'utf8').toString('base64');
}

function ack(emit, ms = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ack timeout')), ms);
    emit((res) => { clearTimeout(t); resolve(res); });
  });
}

async function main() {
  const s = io('http://localhost:3001/game', {
    transports: ['websocket'],
    auth: { token: devToken('alice', 'Alice') },
  });
  let plays = 0;
  let finished = false;
  let mySeat = null;
  let myHand = [];
  let turn = null;
  let top = null;

  s.on('connect', () => console.log(`[alice] connected ${s.id}`));
  s.on('game:state', (snap) => {
    mySeat = snap.private.seat;
    myHand = snap.private.cardIds;
    turn = snap.public.turnSeat;
    top = snap.public.currentTrickTop;
  });
  s.on('game:played', (p) => {
    plays += 1;
    console.log(`[event] played seat=${p.seat} count=${p.cardIds.length} ids=${p.cardIds.join(',')}`);
  });
  s.on('game:passed', (p) => console.log(`[event] passed seat=${p.seat}`));
  s.on('game:trick-closed', (p) => console.log(`[event] trick-closed lead=${p.lead}`));
  s.on('game:finished', (p) => {
    console.log(`[event] FINISHED winner=${p.winnerTeam} order=${p.finishedOrder.join(',')}`);
    finished = true;
  });

  await new Promise((r) => setTimeout(r, 400));
  const create = await ack((cb) => s.emit('room:create', { visibility: 'public' }, cb));
  const roomId = create.data.id;
  console.log(`room ${roomId} created, adding bots`);

  for (const diff of ['easy', 'normal', 'hard']) {
    const r = await ack((cb) => s.emit('bot:add', { roomId, difficulty: diff }, cb));
    if (!r.ok) throw new Error(`bot:add ${diff} failed: ${r.code}`);
  }
  console.log('bots added, starting');
  const start = await ack((cb) => s.emit('game:start', { roomId }, cb));
  if (!start.ok) throw new Error(`start failed: ${start.code}`);

  // Alice 在自己的回合：出最小单张；不能出则 pass
  const tick = async () => {
    if (finished) return;
    if (turn === mySeat && myHand.length > 0) {
      const picked = myHand[0]; // 最小 cardId（按字典序）
      const r = await ack((cb) => s.emit('game:play', { roomId, cardIds: [picked] }, cb));
      if (!r.ok) {
        // 不能出 → pass（如果不是首出）
        if (top) {
          const p = await ack((cb) => s.emit('game:pass', { roomId }, cb));
          if (!p.ok) console.log(`[alice] pass failed: ${p.code}`);
        } else {
          console.log(`[alice] play failed leading: ${r.code} ${r.message}`);
        }
      }
    }
  };

  for (let i = 0; i < 200 && !finished; i++) {
    await new Promise((r) => setTimeout(r, 200));
    await tick();
  }

  console.log(`\nSUMMARY plays=${plays} finished=${finished}`);
  s.close();
  process.exit(finished ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
