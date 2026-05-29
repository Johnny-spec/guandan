# Pull Request

## 变更摘要

<!-- 用 1-3 句话说明这个 PR 解决什么问题；引用相关 issue：Closes #N -->

## 类型

- [ ] feat（新功能）
- [ ] fix（修复）
- [ ] perf（性能）
- [ ] refactor（重构，不改外部行为）
- [ ] docs（仅文档）
- [ ] test（仅测试）
- [ ] build / ci / chore

## 影响范围（scope）

- [ ] `packages/game-engine`
- [ ] `apps/game-server`
- [ ] `apps/teams-tab`
- [ ] `apps/teams-bot`
- [ ] `apps/ai-service`
- [ ] `infrastructure/*`
- [ ] `docs/*`

## 自测清单

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test`（必要时 `pnpm test:cov`）通过
- [ ] 涉及 socket：本地跑过 `apps/game-server/scripts/smoke-bots.mjs`
- [ ] 涉及 UI：本地手测过关键路径（登录 / 大厅 / 房间 / 出牌）
- [ ] 涉及 schema：`pnpm --filter game-server exec prisma validate` 通过
- [ ] 文档已同步（架构 / 规则 / API 变更必须更新对应 docs/）

## 设计/取舍说明（可选）

<!-- 关键决策、替代方案、已知遗留问题 -->

## 截图 / 录屏（UI 改动）

<!-- 拖入图片或视频 -->
