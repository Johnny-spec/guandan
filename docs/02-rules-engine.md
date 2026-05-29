# 02 · 规则引擎 v1.0

> Rules Agent 的产物。实现位于 `packages/game-engine/`。

## 模块映射

| 文件 | 职责 |
|---|---|
| `cards.ts` | `Card` 类型、108 张牌构造、`naturalRankValue` / `pointValueOf` / `isWildcard` / `cardId` / `sortByPoint` |
| `patterns.ts` | `recognize(cards, level)` → `RecognizedPattern \| null`，按"强 → 弱"优先级识别 10 种牌型 |
| `compare.ts` | `compare(current, challenger)`：返回正/零/负；含炸弹层级与王炸通杀 |
| `validator.ts` | `validatePlay(play, ctx)`：手牌包含校验 + 牌型识别 + 跟牌比较 |

## 已实现牌型（10 种）

`single` / `pair` / `triple` / `straight` / `pair-chain` / `triple-pair` / `plate` / `bomb` / `straight-flush` / `rocket`。

## 关键设计

- **百搭（逢人配）**：当前级牌的红心牌（任意副）。可替代任意非王普通牌；不可与王混合做对/三/炸。
- **点数体系**：
  - 顺子/连对/钢板/同花顺 → `naturalRankValue`（2..14，A 可低为 1 用于 A2345）。
  - 单/对/三/炸/三带二 → `pointValueOf`：级牌=15，小王=16，大王=17。
- **炸弹层级**（`bombTier`）：4-bomb=4 → 5=5 → 6=6 → **straight-flush=6.5** → 7 → … → **rocket=100**。
- **比较语义**：
  - 同型同长比 `primaryWeight`。
  - 炸类与非炸类比 → 炸类胜。
  - 双方都是炸类 → 先比层级，再比主点。
- **手牌包含**：按物理 `cardId = "{suit}-{rank}-{deck}"` 或 `"J-{color}-{deck}"` 计数；deck 不同视为不同牌。

## 测试覆盖

`packages/game-engine/src/__tests__/`（**50 用例全绿**）：

- `cards.test.ts`：108 张牌、4 王（1）
- `patterns.test.ts`：10 种牌型 × 正常/边界/百搭/无效（32）
- `compare.test.ts`：同型、跨型、炸弹层级、王炸通杀、级牌 > A（9）
- `validator.test.ts`：空出、不在手中、非法牌型、起手、不够大、压过、炸压、双副牌区分（8）

运行：

```bash
cd packages/game-engine
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

## 已知限制 / TODO

- 进贡 / 抗贡 / 双下升级 / 自动判牌 / 出牌提示等"对局流程"逻辑暂不在引擎内（属 `apps/game-server` 状态机职责）。
- 同花顺允许百搭参与（采用宽松规则）；如赛事要求"硬同花顺"可在 `tryStraightFlush` 中拒绝 `wilds.length > 0`。
- 跨 A→2 的顺子（如 Q-K-A-2-3）一律拒绝；唯一允许的环绕是 A-2-3-4-5。
