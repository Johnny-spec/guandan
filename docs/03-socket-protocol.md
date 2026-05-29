# 03 — Socket Protocol (Real-Time Agent v1.0)

> Phase 1 实时联机协议。单一事实来源：`packages/socket-protocol/src/events.ts`。
> 命名空间：`/game`（Socket.IO）。

## 1. 鉴权

握手时通过 `socket.handshake.auth.token` 提交令牌。

- **Phase 1（dev）**：`"dev:" + base64(JSON.stringify({ userId, displayName }))`
- **Phase 2（生产）**：Entra ID JWT（TODO：JWKS 验签 + `exp` 校验）

`AuthService.makeDevToken(userId, displayName)` 是 helper。
握手中间件失败 → `next(new Error("UNAUTHORIZED"))`，客户端会触发 `connect_error`。

## 2. AckResult 契约

所有 client→server 事件均返回：

```ts
type AckResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };
```

客户端只需关心 `res.ok`；失败时 `code` 是 `ERROR_CODES` 中的常量。

## 3. ERROR_CODES

| Code | 含义 |
| --- | --- |
| `UNAUTHORIZED` | 鉴权失败 |
| `ROOM_NOT_FOUND` | 房间不存在 |
| `ROOM_FULL` | 房间已满 4 人 |
| `NOT_IN_ROOM` | 当前用户不在该房间 |
| `NOT_HOST` | 仅房主可执行 |
| `GAME_ALREADY_STARTED` | 已开局 |
| `GAME_NOT_STARTED` | 尚未开局 |
| `NOT_YOUR_TURN` | 非当前回合 |
| `INVALID_PLAY` | 出牌非法（细分原因在 `message`：`CARD_NOT_IN_HAND` / `EMPTY_PLAY` / `UNKNOWN_PATTERN` / `MUST_FOLLOW` / `WEAKER` / `WRONG_LENGTH` …） |
| `INTERNAL` | 服务端异常 |

## 4. 事件清单

### Client → Server

| 事件 | Payload | Ack Data |
| --- | --- | --- |
| `room:create` | `{ visibility: 'public'\|'private' }` | `RoomDetail` |
| `room:join` | `{ roomId }` | `RoomDetail` |
| `room:leave` | `{ roomId }` | `void` |
| `game:start` | `{ roomId }` | `void` |
| `game:play` | `{ roomId, cardIds: string[] }` | `void` |
| `game:pass`  | `{ roomId }` | `void` |
| `ping`       | — | `number` (server epoch ms) |

### Server → Client

| 事件 | Payload | 时机 |
| --- | --- | --- |
| `room:updated` | `RoomDetail` | 任何房间状态变化（成员、座位、phase） |
| `game:state` | `GameStateSnapshot`（公开 + 自己手牌） | 私播：开局 / 出牌 / 重连 |
| `game:played` | `{ seat, cardIds }` | 公开广播：某座出牌 |
| `game:passed` | `{ seat }` | 公开广播：某座 pass |
| `game:trick-closed` | `{ winnerSeat, nextLeadSeat }` | 三家 pass 后回合关闭 |
| `game:finished` | `{ winnerTeam, finishedOrder, nextLevel }` | 本局结束 |

## 5. 卡片线协议

`cardId` 字符串：
- 普通牌：`<suit>-<rank>-<deck>`，如 `"S-7-0"`、`"H-10-1"`
- 王：`J-red-0` / `J-black-1`

两副牌每张物理牌都有唯一 `cardId`；`deck ∈ {0,1}`。
出牌时客户端必须按 *物理牌* 提交（含 deck 标识），服务端做精确多重集差集校验。

## 6. 私有快照分发

每当 game state 变化（start / play / pass / trick-closed），网关：

1. `server.emit('room:updated', detail)` → 整桌广播公共状态
2. 对每个**在线席位**用 `userSocket.get(userId)` 查 socketId
3. 用 `(this.server as Namespace).sockets.get(sockId)` 取该用户 socket
4. 推送 `game:state` 仅含本人 `private.cardIds`

观战者（`spectatorIds`）只收 `room:updated` 与公开事件，不收 `game:state`。

> **NestJS 陷阱**：`@WebSocketGateway({ namespace: '/game' })` 中
> `@WebSocketServer()` 注入的是 **Namespace**（运行时），但其静态类型标
> 注为 `Server`。所以在 namespaced gateway 内
> `this.server.sockets` 实际上是 `Map<SocketId, Socket>`，需要 cast 到
> `Namespace<...>` 才能让 TS 通过。
>
> 另一坑：`tsx` (esbuild) **不** 发射 `emitDecoratorMetadata`，
> 所以 NestJS 构造函数注入失效。解决方案：所有 gateway/controller/service
> 的构造参数都显式加 `@Inject(Token)`。已在 `GameGateway` 应用。

## 7. 重连流程

1. 客户端重新 `connect()`（同 dev token 同 userId）
2. 网关 `handleConnection`：
   - `userSocket.set(userId, newSocketId)`
   - `rooms.getRoomForUser(userId)` 查回原房间
   - `socket.join(roomId)` 进入 socket.io 房间
   - 发 `room:updated`（公共）+ `game:state`（私有）追状态
3. 离线计时：`handleDisconnect` 调 `rooms.markOffline(userId)`，
   超过阈值（Phase 3 接入）才真正释放席位

## 8. Socket.IO Redis 适配器

`REDIS_URL` 环境变量存在时，启动时挂 `@socket.io/redis-adapter`
（依赖 `ioredis`），让多个 game-server 实例共享房间与广播；
未设置时退化为内存适配器，方便本地调试。

代码：`apps/game-server/src/redis-io.adapter.ts`。

## 9. 防作弊校验

| 检查点 | 实现 |
| --- | --- |
| 鉴权身份 | 握手中间件，session 关联 userId |
| 出牌权 | `session.seatForUser(userId)` 必须 = `turnSeat` |
| 手牌一致 | `cardIds` 必须是当前手牌的精确多重子集 |
| 牌型合法 | `recognize()` 必须返回非 `Unknown` |
| 跟牌压制 | 与本墩 top 比较走 `compare()`，必须严格大于（含炸弹分级） |

服务端永远不接受客户端报告的"我有什么牌"——以 `GameSession` 内部状态为准。

## 10. 测试

- 单元：`apps/game-server/src/__tests__/{auth,room,game.session}.service.test.ts`（16 用例全绿）
- 冒烟：`apps/game-server/scripts/smoke.mjs` — 起 4 个 socket.io-client，跑
  create → 3 joins → start → 非法出牌 → 非回合出牌 → ping，全程验证 ack/广播
- 运行：`pnpm --filter game-server dev` 起服，新窗口
  `node apps/game-server/scripts/smoke.mjs`

## 11. Phase 1 简化与 TODO

| 项 | 现状 | TODO |
| --- | --- | --- |
| 首发玩家 | 固定 N 先手 | 改为持 ♥3 玩家 / 上局头游 |
| 进贡/抗贡 | 未实现 | Phase 2（贡牌动画事件） |
| 升级机制 | 未实现 | 单/双下计算 |
| 断线超时 | 仅记 lastSeenAt | Phase 3：超时托管 / 释放席位 |
| 回放日志 | 未实现 | Phase 3：event log → object storage |
| 观战 spectatorIds | 数据结构就绪 | `room:spectate` 事件接入 |
