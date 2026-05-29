# 04 — Frontend UI (Teams Tab v1.0)

> Phase 1 前端：Next.js 15 + React 19 + Fluent UI + socket.io-client。
> 入口 `apps/teams-tab`，开发：`pnpm --filter teams-tab dev` → http://localhost:3000

## 1. 页面

| 路由 | 组件 | 作用 |
| --- | --- | --- |
| `/`            | `<Lobby/>`     | 登录（dev 昵称） + 创建房间 / 加入房间 + 连接状态 |
| `/room/[id]`   | `<RoomPage/>` → `<GameTable/>` | 4 座牌桌、私有手牌、出牌/过/离开/开始 |

## 2. 状态管理

- `useAuthStore` (zustand, persisted) — `{ userId, displayName }`，登出清空。
- `useRoomStore` (zustand) — `{ room, snapshot, lastPlay, toast }`，事件→store 单向更新。

> 选择 Zustand 而非 RTK Query：socket-driven 数据流不适合请求-响应模型；
> TanStack Query 留给将来的 REST（战绩、排行榜）。

## 3. Socket 单例

`src/hooks/use-socket.ts` 维护一个**进程内单例** Socket：

- `ensureSocket(userId, displayName)` — 若 userId 不变则复用；变更则关闭旧的、新建。
- `useSocket()` — React Hook，挂全局事件监听 → 同步到 store。
- `emitAck(event, payload)` — 把 ack 风格 emit 包成 5 s 超时 Promise，返回 `AckResult<T>`。
- `connect_error` → Toast 错误（鉴权失败、网络中断都会触发）。

## 4. UI 组件

| 组件 | 关键点 |
| --- | --- |
| `AppShell`  | `FluentProvider` + 底部 Toast（2.5 s 自动消失） |
| `Card`      | 44×64 px；红桃/方块红字；selected 上抬 12 px |
| `SeatBadge` | 座位 / 昵称 / 手牌数；当前回合金边；离线/托管标记 |
| `GameTable` | CSS Grid 4 方位；自己永远在 bottom（`relativePos` 旋转座位） |
| `Lobby`     | 输入昵称 → `setUser` → 创建/加入卡片 |

## 5. 关键交互

- 出牌：点手牌切换 `selected` Set，「出牌」按钮 → `emitAck('game:play', {roomId, cardIds:[...selected]})`。
  - 服务器拒绝（`INVALID_PLAY:UNKNOWN_PATTERN`、`NOT_YOUR_TURN`）→ Toast 红色错误。
  - 成功 → 清空 selected；server 广播 `game:played` → store.lastPlay → 桌面中央渲染。
- 过：仅在 `currentTrickTop != null`（不是新墩首出）时启用。
- 开始游戏：仅房主 + 4 座已满才启用。
- 离开：`emitAck('room:leave')` + 跳回首页。
- 刷新房间页：`useEffect` 重发 `room:join`，server 自动 push `room:updated` + `game:state`（重连流程见 `docs/03 §7`）。

## 6. 私有 vs 公开渲染

`snapshot.private.cardIds` 仅自己持有；其他 3 家通过 `room.players[i].handCount` 展示张数。

## 7. 配置

- `NEXT_PUBLIC_GAME_SERVER_URL`（默认 `http://localhost:3001`）— 指向 game-server。
- Fluent UI `webLightTheme`，Phase 2 接 Teams `useTeamsContext()` 切深色/高对比。

## 8. 本地联调

```powershell
pnpm --filter game-server dev   # 终端 A
pnpm --filter teams-tab dev     # 终端 B
# 开 4 个隐身窗口登录 alice/bob/carol/dan，alice 创建房间→其他加入→开始
```

## 9. 验证

- `pnpm --filter teams-tab typecheck` ✅
- `pnpm --filter teams-tab build` ✅（4 路由 / 静态 + 动态混合）
- `curl /` → 200，`curl /room/test` → 200，`curl :3001/health` → 200

## 10. Phase 1 TODO

| 项 | 现状 | TODO |
| --- | --- | --- |
| 登录 | 纯昵称 → dev token | Phase 2：Teams SSO（Entra ID）→ JWT |
| 路由跳转 | `window.location.href` | 改 `router.push` |
| 牌排序 | 字典序 | 按 rank/suit 业务序 |
| 牌型预览 | 无 | 选中即时 `recognize()` 显示牌型 / 能否压上墩 |
| 出牌动画 | 无 | 飞牌动画 + 累积墩区 |
| 观战 | 仅展示 | `room:spectate` 事件 + 隐藏出牌区 |
| 移动端 | 桌面布局 | 响应式 + 横屏 |
| Teams Tab manifest | 待填 | Phase 2：manifest.json + 图标 |
