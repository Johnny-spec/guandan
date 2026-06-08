import { Module } from '@nestjs/common';
import { InMemoryUserPiiSink, USER_PII_SINK } from './user-pii.sink.js';
import { EraseService } from './erase.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  providers: [
    InMemoryUserPiiSink,
    { provide: USER_PII_SINK, useExisting: InMemoryUserPiiSink },
    EraseService,
  ],
  controllers: [AdminController],
  exports: [USER_PII_SINK, EraseService],
})
export class AdminModule {}
