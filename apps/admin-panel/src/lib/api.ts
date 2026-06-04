/** Admin Panel 调用 game-server REST 的最小封装。 */
export const GAME_SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  code: string;
  message: string;
}
export type ApiResult<T> = ApiOk<T> | ApiErr;

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${GAME_SERVER_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) {
      return { ok: false, code: `HTTP_${res.status}`, message: res.statusText };
    }
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error).message };
  }
}

export async function apiSend<T>(
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${GAME_SERVER_URL}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, code: `HTTP_${res.status}`, message: res.statusText };
    }
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error).message };
  }
}
