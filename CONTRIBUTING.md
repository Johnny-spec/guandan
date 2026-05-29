# Contributing

欢迎为 **Teams Guandan** 贡献代码！本文是约定的浓缩版；完整规范见 [docs/10-conventions.md](docs/10-conventions.md)，路线图见 [docs/09-master-orchestrator.md](docs/09-master-orchestrator.md)。

## 1. 环境

- Node 20.11+，pnpm 9，Python 3.12（仅 `apps/ai-service`），Docker Desktop。
- 首次：`pnpm install`；启动：`docker compose up -d postgres redis && pnpm dev`。

## 2. 分支

- `main`：受保护，所有合并必须走 PR + 通过 CI。
- 特性：`feat/<area>-<short-desc>`，例：`feat/game-tribute-phase`。
- 修复：`fix/<area>-<short-desc>`。
- 文档：`docs/<short-desc>`，重构：`refactor/...`，杂项：`chore/...`。

## 3. Commit

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
<type>(<scope>): <subject>

[body]

[footer]
```

- `type`：`feat | fix | docs | refactor | perf | test | build | ci | chore | revert`
- `scope`：`engine | server | tab | bot | ai | db | infra | docs | ci | deps`
- 中英文均可；正文换行处保留空行。
- Breaking change：`feat(server)!: ...` 或在 footer `BREAKING CHANGE: ...`。

## 4. Pull Request

- 标题同样走 Conventional Commits。
- 模板见 `.github/PULL_REQUEST_TEMPLATE.md`，需勾选自测项。
- 必过 CI：`typecheck / lint / test:cov / build / e2e / security`。
- 至少 1 个 reviewer approve；动到 `packages/game-engine` 或 `apps/game-server/src/game/*` 需要 2 个。
- Squash merge，PR 标题作为 commit message。

## 5. 代码风格

- TypeScript 严格模式（`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）。
- 禁止 `any`；公共 API 显式标类型。
- 文件名 `kebab-case.ts`；类 `PascalCase`；函数/变量 `camelCase`；常量 `UPPER_SNAKE`。
- 共享类型放 `packages/shared-types`；socket 事件契约放 `packages/socket-protocol`。
- 注释只写"为什么"，不写"做什么"。

## 6. 测试

- 新增/修改功能必须带单测；改 `game-engine` 必带样例。
- 集成测试：影响 socket 协议或网关时必须更新 `socket.e2e.test.ts`。
- 覆盖率不得低于现状（详见 `docs/08-qa.md` §3）。

## 7. DCO / 许可

- 提交需带 `Signed-off-by`：`git commit -s`。
- 默认 MIT/Apache-2.0 双许可（最终以仓库根 `LICENSE` 为准）。
