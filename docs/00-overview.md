# 00 · 项目总览

**Microsoft Teams 掼蛋（Guandan）平台** — 企业级 Teams App，覆盖实时对战、AI、观战、裁判、赛事。

## 多 Agent 分工

| Agent | 范围 | 主要产物 |
| --- | --- | --- |
| Architect | 系统架构 | docs/01-architecture.md |
| Rules    | 规则引擎 | packages/game-engine |
| Socket   | 实时同步 | packages/socket-protocol + apps/game-server |
| Frontend | Teams Tab UI | apps/teams-tab |
| Bot      | Teams Bot 命令 | apps/teams-bot |
| AI       | 人机决策 | apps/ai-service |
| Database | 持久化 | apps/game-server/prisma |
| DevOps   | 部署/CI | infrastructure/ + .github/workflows |
| QA       | 测试 | 各 package 的 vitest / playwright |
| Replay / Spectator / Referee / Security | 详见 [prompts.md](./prompts.md) |

## Phase

1. **Phase 1 (MVP)**：登录 / 房间 / 发牌 / 出牌 / WebSocket / 简易 UI。
2. **Phase 2**：AI Bot、排行榜、战绩。
3. **Phase 3**：回放、观战、裁判。
4. **Phase 4**：赛事系统、公会、Teams 企业赛事、AI 解说。

## 当前进度

- [x] **Phase 0 / Skeleton** — Monorepo 骨架、各 app/package 的空架子与配置。
- [x] **Architect Agent v1.0** — [docs/01-architecture.md](./01-architecture.md)（22 节 + 10 Mermaid 图，覆盖架构、状态机、部署、鉴权、监控、扩展性）。
- [x] **Rules Agent v1.0** — [docs/02-rules-engine.md](./02-rules-engine.md)，`packages/game-engine`（10 种牌型 + 百搭 + 炸弹层级 + 王炸；50 vitest 全绿）。
- [x] **Socket Agent v1.0** — [docs/03-socket-protocol.md](./03-socket-protocol.md)，`apps/game-server` NestJS 网关 + 房间/会话/鉴权（16 vitest 全绿；4 客户端冒烟通过）。
- [x] **Frontend Agent v1.0** — [docs/04-frontend.md](./04-frontend.md)，`apps/teams-tab` Next.js 15 + Fluent UI + Zustand + socket 客户端（登录 / 大厅 / 房间 / 牌桌 / 出牌 / 过；build + typecheck 全绿）。
- [x] **AI Bot Agent v1.0** — [docs/05-ai-bot.md](./05-ai-bot.md)，`apps/game-server/src/ai/`（3 难度策略 + `enumerateBasicPlays` + bot 调度器；7 vitest 全绿；1 人 + 3 bots 全程冒烟跑完 54 手）。
- [x] **Database Agent v1.0** — [docs/06-database.md](./06-database.md)，`apps/game-server/prisma/schema.prisma`（17 models + 13 enums；`prisma validate` 通过）。
- [x] **DevOps Agent v1.0** — [docs/07-devops.md](./07-devops.md)，3 个 Dockerfile + `docker-compose.yml`（含 `obs` profile）+ `infrastructure/k8s/`（namespace/config/game-server HPA+PDB/teams-tab/ai-service/stateful/ingress）+ `.github/workflows/release.yml` & `security.yml` + Prometheus/Grafana/Loki/OTel 配置。
- [x] **QA Agent v1.0** — [docs/08-qa.md](./08-qa.md)，game-engine 覆盖率 87% lines / 88% branches，game-server 24 vitest（新增 1 个 socket e2e），Playwright + 自研压测脚本 + Mock Graph 服务，CI 含 coverage + e2e 双 job。
- [x] **Master Orchestrator Agent v1.0** — [docs/09-master-orchestrator.md](./09-master-orchestrator.md) + [docs/10-conventions.md](./10-conventions.md) + [CONTRIBUTING.md](../CONTRIBUTING.md) + `.github/CODEOWNERS` + PR 模板。九位 Agent 全部交付，Phase 1 MVP 闭环。
- [x] **Phase 2 · Sprint 1 (战绩 / 排行榜 MVP)** — `apps/game-server/src/match/`：`MatchRepository`（InMemory + 接口与 Prisma schema 对齐）、`RatingService`（团队 ELO，K=24）、`MatchService` 接入 `GameGateway` 在 `game:start` / `game:finished` 自动落库与回写评分；REST 控制器 `GET /api/v1/{users/:id,matches,leaderboard}`；teams-tab 新增 `/profile` 与 `/leaderboard` 页面 + 大厅导航。新增 14 个 vitest（rating 7 + match 7），全部测试 38 绿。
- [x] **Phase 2 · Sprint 2 (Tier 段位计算)** — `apps/game-server/src/match/tier.service.ts`：7 档段位（青铜 → 宗师）+ 进度条计算；MatchService.getUserView / listLeaderboard 自动注入 tier；teams-tab 战绩页加段位 banner + 排行榜列加段位徽章。新增 9 个测试（tier 8 + match 段位 1），测试 48 全绿。
- [x] **Phase 2 · Sprint 2 (战绩翻页 / 时间筛选)** — `MatchRepository.queryMatchesByUser({limit,cursor,since,until,completedOnly})` 游标分页；REST `/api/v1/matches` 兼容数组与 page 两种形态；teams-tab 战绩页加日期筛选 + 仅已完成 + 加载更多按钮；总场数显示。+6 测试 → 54/54。
- [x] **Phase 2 · Sprint 2 (RatingEvent 流水)** — `MatchRepository.createRatingEvent / listRatingEventsByUser`（与 Prisma `model RatingEvent` 字段对齐）；`MatchService.onFinish` 为每个人类玩家写一条 `match_win` / `match_loss` 流水；新增 `GET /api/v1/users/:id/rating-events`。+5 测试 → 59/59。为 Prisma 落地铺好事件溯源。
- [x] **Phase 2 · Sprint 2 (排行榜缓存层 / ZSET)** — `apps/game-server/src/match/leaderboard.cache.ts`：`LeaderboardCache` 接口（语义对齐 Redis ZSET：setScore / incrBy / remove / scoreOf / rankOf / topN / size）+ `InMemoryZSetLeaderboard` 实现（`(score desc, userId asc)` 稳定排序，二分插入，bot 不入榜）。`MatchService.onFinish` 同步写 cache；`listLeaderboard` 优先走 cache 路径；新增 `GET /api/v1/users/:id/rank` 返回 `{ rank, score, total, tier }`。+14 测试 → 73/73。后续接 ioredis 仅替换 Module Provider。
- [x] **Phase 3 · 启动 (Replay 事件日志 MVP)** — 新增 `apps/game-server/src/replay/`：`ReplayService`（按 matchId 维护单调 seq 事件流，支持 match_start / play / pass / trick_closed / match_finish）+ REST `GET /api/v1/matches/:id/replay`；`MatchService.getActiveMatchId(roomId)` 暴露当前对局；`GameGateway` 在人类 & bot 出牌路径上同步追加事件。+8 测试 → 81/81。接口与未来 Postgres `match_events` 表对齐，Spectator / 播放器可直接消费。
- [x] **Phase 3 · Sprint 1 (Replay 播放器 UI)** — `apps/teams-tab/src/components/ReplayPlayer.tsx` + 路由 `/replay/[id]`：拉取 `/api/v1/matches/:id/replay`，事件时间线 + 步进 / 上一步 / 末尾 / 自动播放（0.5x / 1x / 2x / 4x）+ 进度条；座位颜色 + 事件描述（出牌 / 过 / 收墩 / 胜负）。Profile 战绩行新增"回放"入口。teams-tab build 通过（新增 `/replay/[id]` 路由 3.05 kB）。
- [x] **Phase 3 · Sprint 1 (观战模式 spectator socket room)** — `RoomService` 新增观战者状态（`spectators` Map + `spectatorRoom` 反查）；Gateway 增加 `spectate:join` / `spectate:leave` 命令（自动 join socket.io 房间 → 接收所有公开广播；不接收私有 `game:state`，无法出牌）；断线钩子 `detachSpectator` 自动清理；`RoomDetail.spectatorIds` 正确填充；唯一玩家退出但仍有观战者时房间保留。+13 测试 → 94/94 全绿。
- [x] **Phase 3 · Sprint 1 (Referee 后台基础)** — 新增 `apps/game-server/src/referee/`：`RefereeService`（角色注册 + 审计日志：warn / mute / unmute / kick / force_end / note，全局单调递增 id）+ REST `POST/GET/DELETE /api/v1/referee/roles[/:userId]`、`POST/GET /api/v1/referee/actions`；字段校验（warn/mute/unmute/kick 必填 targetUserId）；角色与日志解耦（撤销角色不回滚历史）；list 支持 roomId/matchId/refereeUserId/targetUserId/kind/sinceMs/limit 多维过滤。+18 测试 → 112/112 全绿。
- [x] **Phase 3 · Sprint 2 (Referee Gateway 实战联动)** — `RoomService.kickMember` / `forceEndSession`（前者复用 leaveRoom 清理 + 自动让位 / 空房销毁；后者只清 `session` 返回 `hadSession`）；socket-protocol 新增 `referee:kick` / `referee:force_end` 客户端事件、`game:aborted` / `room:kicked` / `referee:action` 服务端事件、`NOT_REFEREE` 错误码；`GameGateway` 注入 `RefereeService`：校验 `isReferee` → RoomService 执行 → 写审计 → 广播 `referee:action` + `room:updated`；force_end 额外调用 `MatchService.onAbort` + `bots.cancel` 并广播 `game:aborted`，kick 单播 `room:kicked` 给被踢者后离房。+8 测试（room.service.referee）→ 120/120 全绿。
- [x] **Phase 3 · Sprint 2 (Referee 实时事件 warn / mute / unmute)** — `RoomService` 新增 `mutedUsers` Set + `muteMember` / `unmuteMember` / `isMuted`（幂等，目标须在房）；socket-protocol 增加 `referee:warn` / `referee:mute` / `referee:unmute` 三命令；`GameGateway` 增 3 handlers：鉴权 `isReferee` → mute/unmute 更新房间状态 → 写审计 → 广播 `referee:action`（mute/unmute 附带 `room:updated`）。`isMuted` 已就位为 Phase 4 聊天广播提供拦截钩子。+6 测试 → 126/126 全绿。
- [x] **Phase 3 · Sprint 2 (Spectator socket e2e)** — `socket.spectator.e2e.test.ts`：实际拉起 Nest + socket.io，host + 3 bots + spectator 联机一局；断言 spectator 收到 `room:updated` / 大量 `game:played` & `game:passed` 但 `game:state` 0 次、`spectate:leave` 后停止接收后续 `room:updated`。+1 e2e 测试 → 127/127 全绿。
- [x] **Phase 3 · Sprint 2 (观战入口 UI)** — `apps/teams-tab` 增加 Lobby「观战」按钮（与「加入」共享房间号输入），新路由 `/spectate/[id]`；新组件 `SpectatorTable` 复用牌桌布局 + 中央 lastPlay + 头部观战人数 + 「退出观战」按钮（`spectate:leave`）。teams-tab build 通过（`/spectate/[id]` 3.53 kB）。

## 关键决策

- **monorepo**：pnpm workspace + 5 apps + 5 packages。
- **语言**：TypeScript（前后端 + 共享 package）、Python（AI 服务）。
- **实时通信**：Socket.IO + Redis Adapter（横向扩容）。
- **数据库**：PostgreSQL + Prisma；Redis 用于会话、房间、Pub/Sub。
- **Teams 集成**：Tab + Bot Framework + Adaptive Cards，SSO 走 Entra ID。
