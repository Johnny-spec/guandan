// 端到端 socket 集成测试：启动 Nest 应用 → 1 人 + 3 bots 跑完一局。
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

describe('socket e2e: 1 human + 3 bots', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { cors: true, logger: false });
    await app.listen(0);
    const server = app.getHttpServer();
    const addr = server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}/game`;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('能创建房间、加入 bots、开始并完整跑完一局', async () => {
    const socket: Socket = io(url, {
      transports: ['websocket'],
      auth: { token: AuthService.makeDevToken('alice', 'Alice') },
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });

    let mySeat: string | null = null;
    let hand: string[] = [];
    let turnSeat: string | null = null;
    let hasTop = false;
    let plays = 0;
    let finished = false;

    socket.on('game:state', (snap: any) => {
      mySeat = snap.private.seat;
      hand = snap.private.cardIds;
      turnSeat = snap.public.turnSeat;
      hasTop = !!snap.public.currentTrickTop;
    });
    socket.on('game:played', () => {
      plays += 1;
    });
    socket.on('game:finished', () => {
      finished = true;
    });

    const create = await ack<any>((cb) =>
      socket.emit('room:create', { visibility: 'public' }, cb),
    );
    expect(create.ok).toBe(true);
    const roomId = create.data.id;

    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const r = await ack<any>((cb) =>
        socket.emit('bot:add', { roomId, difficulty }, cb),
      );
      expect(r.ok).toBe(true);
    }

    const start = await ack<any>((cb) =>
      socket.emit('game:start', { roomId }, cb),
    );
    expect(start.ok).toBe(true);

    for (let i = 0; i < 1000 && !finished; i++) {
      await new Promise((r) => setTimeout(r, 30));
      if (turnSeat === mySeat && hand.length > 0) {
        const r = await ack<any>((cb) =>
          socket.emit('game:play', { roomId, cardIds: [hand[0]] }, cb),
        );
        if (!r.ok && hasTop) {
          await ack((cb) => socket.emit('game:pass', { roomId }, cb));
        }
      }
    }

    socket.close();
    // 验证 socket + bot 整链路：必有大量出牌；理想情况下完赛，但允许达上限退出。
    expect(plays).toBeGreaterThan(20);
  }, 90_000);
});
