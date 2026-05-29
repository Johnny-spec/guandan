# 05 · AI Bot Agent v1.0

> 范围：Phase 1 人机对战。可插拔策略接口、3 档难度、严格"不作弊"信息隔离、< 1s 响应（实测 < 10ms）。

---

## 1. 模块结构

```
apps/game-server/src/ai/
├── strategy.ts          # 纯函数决策（无状态、无 I/O）
├── bot.service.ts       # Nest provider：调度 / 取消 bot 回合
└── __tests__/strategy.test.ts

packages/game-engine/src/
└── legal.ts             # enumerateBasicPlays — bot 共用的合法出牌枚举器
```

调用链：

```
GameGateway.{onStart, onPlay, onPass, applyBotOutcome}
   └→ this.scheduleBot(roomId)
          └→ BotService.schedule(room, onAct)
                 └→ setTimeout 450ms → BotService.driveOnce(room)
                        ├→ session.snapshotForBot()  // 仅当前 bot 私有手牌 + 公开 top + 4 家张数
                        ├→ decideMove(input, difficulty)
                        └→ session.play / pass
                 └→ onAct(outcome) → 广播 → scheduleBot(...)  // 链式
```

---

## 2. 合法出牌枚举 (`enumerateBasicPlays`)

Phase 1 限制（覆盖 80%+ 实战场景，Phase 2 接 MCTS 时扩展）：

| 牌型 | 是否枚举 |
| --- | --- |
| 单张 / 对子 / 三张 | ✅ |
| 炸弹（4..n 张同点） | ✅ |
| 王炸 | ✅ |
| 顺子 / 连对 / 钢板 / 三带二 / 同花顺 | ❌ |
| 主动用百搭组合 | ❌（百搭按红心级牌物理 rank 参与） |

所有候选都经 `validatePlay()` 二次校验，保证 0 非法出牌；跟牌时仅返回能压过 top 的子集。

---

## 3. 决策策略 `decideMove`

| 难度 | 起手 | 跟牌（非炸） | 跟牌（仅炸能压） |
| --- | --- | --- | --- |
| **easy** | 最小单张 | 最小压牌 | 直接用炸 |
| **normal** | 最小组合，多张优先 | 最小压牌 | 留炸；除非对手剩 ≤ 5 |
| **hard** | 同 normal | 最小压牌 | 留炸；除非对手 ≤ 7 或 `pressure > 0.7` |

`pressure = 1 - myHandCount / 27`；对手取 NS/EW 中较少剩张数者。

测试覆盖：
- 起手取最小单张 ✓
- 不能压时 pass ✓
- 能压非炸时取最小 ✓
- normal 保留炸 ✓
- normal 见对手快赢用炸 ✓
- hard 在 pressure > 0.7 用炸 ✓
- 27 张手牌响应 < 50ms ✓

---

## 4. 防作弊设计

`GameSession.snapshotForBot()` 只返回：

```ts
{
  turnSeat: Seat,
  handIds: string[],            // 仅当前 bot 自己的手牌
  top: { cards: Card[] }|null,  // 公开桌面顶张
  remainingCounts: Record<Seat, number>,  // 4 家张数（公开）
}
```

**不暴露**：其他玩家手牌、剩余牌堆、洗牌种子。`decideMove` 是纯函数，架构上无法访问其它私有状态。

---

## 5. Socket 协议扩展

`packages/socket-protocol/src/events.ts` 新增：

```ts
'bot:add':    (payload: { roomId, difficulty: 'easy'|'normal'|'hard' }, ack) => void;
'bot:remove': (payload: { roomId, botUserId }, ack) => void;
```

错误码新增：`GAME_ALREADY_STARTED`, `NOT_A_BOT`。

约束：仅房主、仅 idle、bot 作为 `RoomDetail.players[i]` 的 `isBot: true` 暴露给前端。

---

## 6. RoomService 改动

- `Member.isBot: boolean`，`botDifficulty?: Difficulty`
- 新方法：`addBot / removeBot / memberAtSeat`
- `markOffline` 忽略 bot（bot 永远在线）
- `PlayerSnapshot` 新增 `isBot?: boolean; botDifficulty?` 透传到前端

---

## 7. 调度与时序

`BotService.schedule()`：
- 每个房间最多 1 个 pending 计时器（`pending: Map<roomId, Timeout>`）
- 出牌延迟 `BOT_DELAY_MS = 450ms`
- 链式调度（非递归）— `applyBotOutcome` 末尾再调 `scheduleBot`，setTimeout 自然解栈
- `cancel(roomId)` 在游戏结束 / 房间销毁时调用

---

## 8. 前端 UI

`GameTable` 顶部按钮（房主、未开局、< 4 人时显示）：

```
[+简单Bot] [+普通Bot] [+困难Bot]
```

`SeatBadge` 在 bot 占据时显示 `🤖 normal`；房主可点击「移除」按钮回收座位。

---

## 9. 验证

```bash
pnpm -r typecheck                                # 9/9 全绿
pnpm --filter @teams-guandan/game-engine test    # 55 ✓ (5 new in legal.test.ts)
pnpm --filter game-server test                   # 23 ✓ (7 new in strategy.test.ts)
node scripts/smoke-bots.mjs                      # 1 human + 3 bots，54 手完赛
```

---

## 10. 已知限制（Phase 2 待办）

- 无 MCTS / 记牌器
- 不主动用百搭凑炸 / 三带二
- 不组顺子 / 连对 / 钢板 / 同花顺
- 不识别"队友想出大牌"等高阶配合
- 无"托管"接管（人类断线时 bot 接手）
- 未接 LLM；Python `ai-service` 微服务暂未启用
- 未接 prometheus 监控 bot 决策耗时
