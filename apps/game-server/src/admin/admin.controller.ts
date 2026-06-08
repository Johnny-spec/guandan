import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { EraseError, EraseService, type EraseRequestInput } from './erase.service.js';

function wrap<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (err) {
    if (err instanceof EraseError) {
      throw new HttpException({ ok: false, code: err.code, message: err.message }, err.status);
    }
    throw err;
  }
}

@Controller('api/v1/admin')
export class AdminController {
  constructor(@Inject(EraseService) private readonly erase: EraseService) {}

  /**
   * 触发被遗忘权擦除。Path param `userId` 接受内部 userId（线上可拓展为 AAD oid → userId 解析）。
   * Body：`{ requestedBy, reason }`，两者审计必填。
   */
  @Post('users/:userId/erase')
  eraseUser(@Param('userId') userId: string, @Body() body: EraseRequestInput) {
    return wrap(() => this.erase.eraseUser(userId, body));
  }

  /** 列出审计日志，可按 userId 过滤。 */
  @Get('erase-log')
  listLog(@Query('userId') userId?: string) {
    return wrap(() => this.erase.listEraseLog({ userId: userId || undefined }));
  }
}
