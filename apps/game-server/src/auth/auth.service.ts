import { Injectable, Logger } from '@nestjs/common';

/**
 * Dev 鉴权服务 — Phase 1 使用 base64-JSON 令牌，便于本地联调。
 * Phase 2 替换为 Entra ID 颁发的 JWT（见 docs/01-architecture.md §3）。
 */
export interface AuthenticatedUser {
  userId: string;
  displayName: string;
  /** 'dev' | 'jwt' */
  source: 'dev' | 'jwt';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  verify(token: string | undefined): AuthenticatedUser | null {
    if (!token) return null;

    // dev 协议: "dev:<base64-json>"，json = { userId, displayName }
    if (token.startsWith('dev:')) {
      try {
        const raw = Buffer.from(token.slice(4), 'base64').toString('utf8');
        const obj = JSON.parse(raw) as { userId?: string; displayName?: string };
        if (!obj.userId || !obj.displayName) return null;
        return { userId: obj.userId, displayName: obj.displayName, source: 'dev' };
      } catch (e) {
        this.logger.warn(`dev token decode failed: ${(e as Error).message}`);
        return null;
      }
    }

    // TODO(auth): JWT 验证（Entra ID JWKS + 签名 + exp）。
    return null;
  }

  /** 测试 / 客户端 helper：构造 dev token。 */
  static makeDevToken(userId: string, displayName: string): string {
    const json = JSON.stringify({ userId, displayName });
    return 'dev:' + Buffer.from(json, 'utf8').toString('base64');
  }
}
