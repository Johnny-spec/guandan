# Teams Guandan (掼蛋) Platform

企业级 **Microsoft Teams 掼蛋平台** — Monorepo 骨架。

> 本仓库目前处于 **Phase 0 / Skeleton** 阶段：目录结构、workspace、各 package 的空架子与配置已就位，业务代码尚未实现。详见 [docs/00-overview.md](docs/00-overview.md)。

## 目录结构

```
apps/
  teams-tab/          # Next.js 15 + Teams JS SDK + Fluent UI (Teams Tab 前端)
  teams-bot/          # Microsoft Bot Framework 适配器 (Teams Bot)
  game-server/        # NestJS + Socket.IO + Prisma (实时对战 / API)
  admin-panel/        # Next.js 管理后台
  ai-service/         # Python FastAPI AI 服务

packages/
  game-engine/        # 掼蛋规则引擎 (纯 TS, 无副作用)
  shared-types/       # 跨服务共享类型
  socket-protocol/    # WebSocket 事件契约
  adaptive-cards/     # Teams Adaptive Card 模板
  teams-sdk-wrapper/  # Teams JS SDK 封装

infrastructure/
  docker/  azure/  bicep/  terraform/

docs/                 # 架构、规则、Socket 协议、AI 等子文档
```

## 快速开始

```bash
# 1. 安装依赖（首次会下载 ~ 较大，可耐心等）
pnpm install

# 2. 启动基础设施（Postgres + Redis）
docker compose up -d postgres redis

# 3. 复制环境变量
cp .env.example .env

# 4. 全量 dev（并行启动所有 Node 服务）
pnpm dev

# 5. 仅启动游戏服务器
pnpm --filter @teams-guandan/game-server dev
```

## 技术栈

参见 [docs/00-overview.md](docs/00-overview.md) 与 [docs/prompts.md](docs/prompts.md)（完整多 Agent Prompt 套件）。

## 开发阶段

- **Phase 1 (MVP)**：登录 / 房间 / 发牌 / 出牌 / WebSocket / 简易 UI
- **Phase 2**：AI Bot / 排行榜 / 战绩
- **Phase 3**：回放 / 观战 / 裁判
- **Phase 4**：赛事系统 / 公会 / Teams 企业赛事

## 规范

详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [docs/10-conventions.md](./docs/10-conventions.md)。要点：

- 严格 TypeScript（无 `any`，开启 `noUncheckedIndexedAccess`）
- Conventional Commits + scope (`engine` / `server` / `tab` / `bot` / `ai` / `db` / `infra` / `docs` / `ci`)
- 分支：`main` 保护，特性 `feat/*`，修复 `fix/*`，文档 `docs/*`
- PR 模板自查 + CI 必过：`typecheck / lint / test:cov / build / e2e / security`
- 核心模块 (`game-engine` / `game-server/src/game` / `prisma`) 改动需要 2 个 reviewer
- 路线图与 Sprint 看板见 [docs/09-master-orchestrator.md](./docs/09-master-orchestrator.md)

