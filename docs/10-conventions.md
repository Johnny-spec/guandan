# 10 · 规范

> [09-master-orchestrator.md](./09-master-orchestrator.md) 是路线图；本文是日常 **代码 / 提交 / 评审 / 文档 / API** 规范的硬约束。

## §1 TypeScript

- `tsconfig.base.json` 已开启：`strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes / noFallthroughCasesInSwitch / forceConsistentCasingInFileNames / isolatedModules`。
- **禁止 `any`**；不得已用 `unknown` + 类型守卫。`as` 仅限：(1) 边界反序列化后立即守卫；(2) 与第三方库交互。
- 所有 **导出的** 函数 / 常量 / 类显式标返回类型。
- 路径别名：仅在 `apps/teams-tab` 用 `@/`（Next 默认）；其它 package 一律相对路径，便于跨工具迁移。
- 模块系统：所有 Node app 用 ESM (`"type": "module"`)，import 必须带 `.js` 后缀（NodeNext）。

## §2 命名

| 元素 | 规则 | 例 |
| --- | --- | --- |
| 文件 | kebab-case | `room.service.ts` |
| 测试 | `*.test.ts` 与被测同目录 `__tests__/` | `room.service.test.ts` |
| 目录 | kebab-case | `apps/teams-tab` |
| 类 / 接口 / 类型 | PascalCase | `RoomService`, `GameStateSnapshot` |
| 函数 / 变量 | camelCase | `currentSeat`, `pickLeadCard` |
| 常量 | UPPER_SNAKE | `ERROR_CODES`, `MAX_PLAYERS` |
| Enum 值 | UPPER_SNAKE | `MatchKind.AI_TRAINING` |
| Socket 事件 | `domain:verb` | `room:create`, `game:played` |
| Redis Key | `domain:{id}[:sub]` | `room:abc123:members` |
| DB 表 (Prisma `@@map`) | snake_case 复数 | `match_players` |
| 环境变量 | UPPER_SNAKE | `DATABASE_URL`, `REDIS_URL` |

## §3 模块边界（强约束）

- `apps/*` ✗ import `apps/*`
- `packages/*` ✗ import `apps/*`
- `packages/game-engine` ✗ import 任何 `packages/*`（保持纯）
- `packages/socket-protocol` 仅可 import `packages/shared-types`
- 跨进程 / 跨服务通信 → socket event 或 HTTP（OpenAPI）。

CI 守护：`pnpm typecheck` + 未来引入 `dependency-cruiser` 校验。

## §4 错误处理

- Socket / HTTP 返回统一 `AckResult<T>`：`{ ok: true, data } | { ok: false, code, message }`，`code` 取自 `socket-protocol/ERROR_CODES`。
- 服务层抛 `Error` 子类（`ConflictError` / `NotFoundError` / `ValidationError`），由网关层翻译成 ack code。
- 禁止吞错误：`catch` 必须 (1) 记日志 + 上下文；或 (2) 翻成业务错误。
- 不要 `throw 'string'`、不要 `throw new Error('')`。

## §5 日志

- Node：NestJS `Logger` 现行；Phase 2 切 `pino`（JSON）。
- Python：标准 `logging` + `json-formatter`。
- 字段：`ts, level, msg, traceId, spanId, userId?, roomId?, matchId?`。
- 严禁记录：token、密码、完整手牌（仅最近 1 张）。

## §6 配置 / 环境

- 所有运行时配置走 env；本地见 `.env.example`，**禁止入仓真实值**。
- 必填变量：`DATABASE_URL`, `REDIS_URL`, `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `ENTRA_TENANT_ID`。
- 12-factor：构建产物与配置分离；K8s 用 ConfigMap + ExternalSecrets / Key Vault CSI。

## §7 API 规范

### 7.1 Socket 事件

- 命名：`<domain>:<verb>`，verb 用现在时（`create / play / pass`）或过去式（`played / passed / closed`）。
- 客户端发起：`<domain>:<verb>`，最后参数是 ack callback；payload 必须显式定义 type。
- 服务端广播：`<domain>:<event-name>`，无 ack；payload 必须可序列化（无 Date 对象，用 ISO string）。
- 新增事件 → 改 `packages/socket-protocol` + 加 e2e 测试。

### 7.2 REST（Phase 2 起）

- 风格：资源命名 `/api/v1/rooms/{id}`；动词在 HTTP method 上。
- 错误响应：`{ ok: false, code, message, details? }` + HTTP 4xx/5xx。
- OpenAPI：从 NestJS `@nestjs/swagger` 装饰器生成；落 `apps/game-server/openapi.json` 入仓。
- 客户端：用 `openapi-typescript` 生成 TS 类型给 `teams-tab` 与 `ai-service`。

### 7.3 版本

- Socket：在 connect 握手 `auth.protocolVersion` 校验；不兼容 → `connect_error`。
- REST：路径前缀 `/v1`、`/v2`；不在小版本里破坏行为。

## §8 Git / Commit / 分支

- 见 [CONTRIBUTING.md](../CONTRIBUTING.md)。要点重述：
  - 分支：`feat/<area>-<desc>` `fix/...` `docs/...` `chore/...` `refactor/...`。
  - 提交：[Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)，type+scope+subject。
  - Squash merge；PR 标题作为 commit message。
- 标签：`vX.Y.Z`（SemVer），由 `release.yml` 触发生产部署。

## §9 Lint / Format

- `prettier` 全仓格式化（`.prettierrc` 已配）。
- ESLint 9 flat config（Phase 2 完善规则集，目前各 app `lint` 为 noop 占位）；强约束：
  - `@typescript-eslint/no-explicit-any`：error
  - `@typescript-eslint/consistent-type-imports`：error
  - `import/no-cycle`：error
  - `import/order`：warn
- React：`react-hooks/rules-of-hooks` error；`react/jsx-no-bind` warn。
- Python：`ruff` + `mypy --strict`（`apps/ai-service`）。

## §10 测试规范

- 单测：纯函数优先；副作用通过依赖注入隔离，不要 mock 模块路径。
- 引擎测试用样例数据（牌局回放），不写"测内部实现"的 case。
- 集成：用真实 Nest app + socket.io-client；只在 IO 边界 mock。
- 命名：`describe('<目标>', () => { it('能/应该 …', …) })`，中文 OK。
- 覆盖率门槛见 [08-qa.md §3](./08-qa.md)，下调需 PR 中说明。

## §11 文档

- 每个 Agent 一份 `docs/0X-*.md`；改代码时同步更新对应文档（PR 自查项）。
- Mermaid 图首选；图表数据放在文档内，避免外链失效。
- README 是入口，**禁止**当详细文档；细节链到 `docs/`。

## §12 Code Review

- 反馈优先级：**正确性 > 安全 > 性能 > 可维护性 > 风格**。风格交给 prettier/eslint。
- 评审者：
  - 至少 1 人；
  - 涉及 `game-engine`、`game.gateway.ts`、`prisma/schema.prisma`、`infrastructure/` → 至少 2 人。
- 评审 SLA：工作日 24h 内首次响应。
- 拒绝 LGTM 文化：要么明确批准（带至少 1 条具体反馈），要么 Request changes。
- 作者：每条 review 必须回复（接受 / 反驳 / 已修），不要静默 force-push。

## §13 安全 / 数据

- 严禁把 secrets 入仓；提交前 `gitleaks` 本地扫描（CI 已通过 Trivy + CodeQL 覆盖）。
- PII 走脱敏（参 [06-database.md §7](./06-database.md)）。
- 第三方依赖：仅 npm `latest` 或固定主版本；用 `pnpm audit --prod` + Dependabot 跟进 CVE。

## §14 性能预算

| 项 | 预算 |
| --- | --- |
| socket ack p95 | < 80 ms（同 region） |
| 首屏 LCP (teams-tab) | < 2.5 s |
| AI 决策 | < 1 s |
| 房间创建吞吐 | ≥ 500 /s（单 game-server pod） |

超预算的 PR 需在描述中给出 benchmark + 改进计划。

## §15 例外

任何违反本文的代码必须：
1. 在 PR 描述说明原因；
2. 加 `// CONVENTION-EXCEPTION: <reason> (issue #N)` 注释；
3. 创建 issue 跟踪偿还。
