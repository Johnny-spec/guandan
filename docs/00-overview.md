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

## 关键决策

- **monorepo**：pnpm workspace + 5 apps + 5 packages。
- **语言**：TypeScript（前后端 + 共享 package）、Python（AI 服务）。
- **实时通信**：Socket.IO + Redis Adapter（横向扩容）。
- **数据库**：PostgreSQL + Prisma；Redis 用于会话、房间、Pub/Sub。
- **Teams 集成**：Tab + Bot Framework + Adaptive Cards，SSO 走 Entra ID。
