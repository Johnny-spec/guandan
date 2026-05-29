import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis(redisUrl);
    app.useWebSocketAdapter(adapter);
  } else {
    Logger.log('REDIS_URL not set — using in-memory socket.io adapter', 'Bootstrap');
  }

  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen(port);
  Logger.log(`Game server listening on :${port}`, 'Bootstrap');
}
void bootstrap();
