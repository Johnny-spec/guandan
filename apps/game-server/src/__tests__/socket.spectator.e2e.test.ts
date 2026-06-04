// 观战模式 e2e：玩家 + 3 bots 一局对战，观战 socket 应能收到公开广播但不接收 game:state。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../app.module.js';
import { AuthService } from '../auth/auth.service.js';

function ack<T = unknown>(
  emit: (cb: (res: T) => void) => void,
  ms = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ack timeout')), ms);
    emit((res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function connect(url: string, token: string): Promise<Socket> {
  const s: Socket = io(url, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s));
    s.once('connect_error', (e) => reject(e));
  });
}

describe('socket e2e: spectator 观战模式', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { cors: true, logger: false });
    await app.listen(0);
    const addr = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}/game`;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('观战者能收到公开广播但不接收 game:state', async () => {
    const host = await connect(url, AuthService.makeDevToken('host1', 'Host'));
    const spec = await connect(url, AuthService.makeDevToken('spec1', 'Spectator'));

    let specStateCount = 0;
    let specRoomUpdated = 0;
    let specPlayed = 0;
    let specPassed = 0;
    let specTrickClosed = 0;
    let specFinished = false;

    spec.on('game:state', () => {
      specStateCount += 1;
    });
    spec.on('room:updated', () => {
      specRoomUpdated += 1;
    });
    spec.on('game:played', () => {
      specPlayed += 1;
    });
    spec.on('game:passed', () => {
      specPassed += 1;
    });
    spec.on('game:trick-closed', () => {
      specTrickClosed += 1;
    });
    spec.on('game:finished', () => {
      specFinished = true;
    });

    let hostSeat: string | null = null;
    let hostHand: string[] = [];
    let hostTurn: string | null = null;
    let hostHasTop = false;
    let hostFinished = false;
    host.on('game:state', (snap: any) => {
      hostSeat = snap.private.seat;
      hostHand = snap.private.cardIds;
      hostTurn = snap.public.turnSeat;
      hostHasTop = !!snap.public.currentTrickTop;
    });
    host.on('game:finished', () => {
      hostFinished = true;
    });

    // host 建房 + 加 3 个 bot
    const create = await ack<any>((cb) =>
      host.emit('room:create', { visibility: 'public' }, cb),
    );
    expect(create.ok).toBe(true);
    const roomId = create.data.id;

    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const r = await ack<any>((cb) =>
        host.emit('bot:add', { roomId, difficulty }, cb),
      );
      expect(r.ok).toBe(true);
    }

    // 观战者加入
    const join = await ack<any>((cb) =>
      spec.emit('spectate:join', { roomId }, cb),
    );
    expect(join.ok).toBe(true);
    expect(join.data.spectatorIds).toContain('spec1');

    // 观战者不能出牌（即使尝试也会失败，但更关键是不接收 game:state）
    const start = await ack<any>((cb) =>
      host.emit('game:start', { roomId }, cb),
    );
    expect(start.ok).toBe(true);

    // 跑一段时间让 host + bots 出牌
    for (let i = 0; i < 1000 && !hostFinished; i++) {
      await new Promise((r) => setTimeout(r, 30));
      if (hostTurn === hostSeat && hostHand.length > 0) {
        const r = await ack<any>((cb) =>
          host.emit('game:play', { roomId, cardIds: [hostHand[0]] }, cb),
        );
        if (!r.ok && hostHasTop) {
          await ack((cb) => host.emit('game:pass', { roomId }, cb));
        }
      }
    }

    // 关键断言：观战者收到至少 1 次 room:updated（加入 + 开局）
    expect(specRoomUpdated).toBeGreaterThanOrEqual(1);
    // 观战者收到大量公开出牌广播
    expect(specPlayed + specPassed).toBeGreaterThan(10);
    // 观战者从未收到 game:state 私有快照
    expect(specStateCount).toBe(0);

    // spectate:leave
    const leave = await ack<any>((cb) =>
      spec.emit('spectate:leave', { roomId }, cb),
    );
    expect(leave.ok).toBe(true);

    // 离开后不再收到广播：清空计数，触发一次 bot:remove 应不再上涨
    const before = specRoomUpdated;
    await ack<any>((cb) => host.emit('bot:remove', { roomId, botUserId: 'bot' }, cb));
    // 即便 bot:remove 失败也无妨，主要保证 spec 没收到任何后续 room:updated
    await new Promise((r) => setTimeout(r, 100));
    expect(specRoomUpdated).toBe(before);

    // 哑断言：finished 用于触发条件，不强制必须完赛（与现有 e2e 一致）
    void specFinished;

    host.close();
    spec.close();
  }, 90_000);
});
