# 多 Agent 开发 Prompt 套件（原始版）

> 本文件归档用户提供的完整 Prompt 套件原文，供后续 Copilot CLI / 各 Agent 调用时引用。

---

## 项目目标

开发一套完整的「掼蛋（Guandan）」Microsoft Teams 平台应用（Teams App / Teams 插件），支持：

- Teams 内多人在线实时对战（2v2）
- Teams Tab 游戏界面
- Teams Bot 对战助手
- Teams Meeting 中观战
- Teams 群组内快速开局
- Teams Adaptive Card 互动
- 人机对战（AI Bot）
- 观战模式
- 裁判 / 主持人管理模式
- 企业内部赛事系统
- Microsoft 365 集成
- Azure 云部署

技术目标：可扩展、高并发、低延迟、模块化、AI 友好、多 Agent 协同开发、可持续演进。

---

## 一、推荐技术栈

**Frontend**：React 19、Next.js 15、TypeScript、Microsoft Teams JS SDK、Fluent UI、TailwindCSS、Zustand、TanStack Query、Socket.IO Client。
**Teams Integration**：Teams Tab App、Teams Bot Framework、Adaptive Cards、Teams Meeting Extension、Teams Activity Feed、Teams SSO、Microsoft Graph API。
**Backend**：Node.js 22+、NestJS、Socket.IO、Redis、PostgreSQL、Prisma ORM、Azure AD / Entra ID Auth、OpenAPI。
**AI**：Python FastAPI 微服务、LangGraph / AutoGen（可选）、OpenAI / Azure OpenAI、本地 LLM（Qwen / DeepSeek）。
**部署**：Docker Compose、Kubernetes（后期）、Nginx、Azure DevOps Pipeline、GitHub Actions。

---

## 二、Architect Agent — 系统架构设计

> 你是一名资深游戏平台架构师。请设计一套运行于 Microsoft Teams 平台中的「掼蛋游戏平台 Teams App」完整系统架构。
>
> 系统要求：4 人实时对战、房间、匹配、观战、裁判、断线重连、回放、人机 AI、排行榜、企业赛事、Teams Meeting 内互动、Teams Bot、Teams Channel 群组开局。
>
> 请输出：前后端架构、WebSocket 消息流、Redis 使用方案、数据库 ER 图、服务拆分、模块依赖图、房间状态机、游戏状态同步机制、反作弊方案、AI Bot 接入方案、Docker 部署结构、微服务拆分建议、水平扩展方案、日志与监控方案、Teams App Manifest 设计、Microsoft Graph 集成方案、Teams Bot Framework 设计、API 网关设计、鉴权方案。
>
> 输出要求：Mermaid 图 + markdown，所有模块清晰分层，给出目录结构、扩展性建议、高并发优化建议。

---

## 三、Rules Agent — 掼蛋规则引擎

> 你是精通掼蛋规则的游戏规则专家。实现完整规则引擎。
>
> 支持：单张、对子、三张、顺子、连对、三带二、钢板、炸弹、同花顺、王炸、逢人配、级牌、贡牌、抗贡、升级、双下升级、进贡动画事件、特殊牌型判断、自动判牌、自动提示。
>
> 要求：TypeScript、纯函数、模块化、可测试、提供完整测试样例、牌型优先级、合法出牌校验、AI 可调用接口。
>
> 输出：完整 rules engine、utils、test cases、Type definitions、validator、compare logic、game constants。

---

## 四、Socket Agent — 实时对战

> 你是实时联机游戏网络专家。为 Microsoft Teams 掼蛋 APP 设计完整 WebSocket 实时同步方案。
>
> 支持：创建/加入/离开房间、开始游戏、发牌、出牌、Pass、回合同步、倒计时、心跳、断线重连、状态恢复、结束、观战同步、裁判广播、聊天、Teams 表情、Activity Feed 通知、防作弊。
>
> 输出：Socket Event 列表、Payload Type、服务端代码、客户端代码、Redis Pub/Sub 方案、状态同步机制、Ack、重试、幂等、reconnect、Meeting spectator、replay event log。
>
> 技术：NestJS Gateway + Socket.IO + Redis Adapter + TypeScript + 分布式。

---

## 五、Frontend Agent — Teams UI

> 你是高级 Web 游戏前端工程师。设计 Microsoft Teams 掼蛋平台现代化 UI。
>
> 要求：Fluent UI + Teams 风格、移动端、横屏、动画牌桌、拖拽出牌、快捷出牌、托管、观战视角、裁判视角、实时聊天、回放、段位、排行榜、好友、战绩。
>
> 页面：Tab 首页、群组大厅、匹配、房间、游戏、战绩、回放、Admin。
>
> 输出：React 组件、Zustand Store、Hooks、Socket 状态同步、Fluent UI 组件、动画、响应式、错误处理、Loading。
>
> 要求：Next.js App Router + TypeScript + TailwindCSS + 高性能渲染（memo / useCallback）。

---

## 六、AI Agent — 人机 Bot

> 你是棋牌 AI 专家。实现掼蛋 AI Bot。
>
> 支持：新手 / 普通 / 困难 / 专家、配合队友、记牌、算牌、炸弹概率、剩余牌型估算、决策策略、动态难度、托管接管、可插拔 AI、LLM Agent、规则 AI、Monte Carlo、未来强化学习。
>
> 输出：AI 架构、Strategy Interface、Decision Engine、Simulation Engine、记牌模块、风险评估、出牌推荐、托管逻辑。
>
> 要求：AI 不许作弊，只能看合法信息，响应 < 1s，支持多人 Bot。

---

## 七、Database Agent — 数据库

> 你是大型游戏平台数据库架构师。设计掼蛋平台数据库。
>
> 支持：用户、好友、房间、游戏记录、回放、排行榜、段位、AI 对战记录、裁判日志、观战记录、封禁、举报。
>
> 输出：Prisma Schema、PostgreSQL 表结构、索引、Redis Cache 方案、分表建议、审计日志、replay 存储、高频查询优化。

---

## 八、DevOps Agent

> 设计完整 Azure DevOps 体系：容器化、CI/CD、自动测试、自动部署、灰度发布、监控告警、日志、Kubernetes、Redis Cluster、PostgreSQL 主从、Teams App 发布、AppSource、WAF、DDoS。
>
> 输出：docker-compose.yml、Kubernetes YAML、GitHub Actions、Nginx Config、Prometheus、Grafana、Loki、OpenTelemetry。

---

## 九、QA Agent

> 单元 / 集成 / WebSocket / 压力 / 并发 / AI / UI 自动化 / E2E / 安全 / 断线重连测试。
>
> 输出：Jest、Playwright、Socket 测试、Benchmark、Mock Server、Coverage、Load Test Script。
>
> 覆盖率 > 80%、CI 自动执行、多人压测。

---

## 十、Master Orchestrator

> Phase 1：基础房间 + 基础规则 + WebSocket 对战。
> Phase 2：AI Bot + 排行榜 + 战绩。
> Phase 3：回放 + 观战 + 裁判。
> Phase 4：赛事 + 公会 + AI 托管 + Teams 企业赛事。
>
> 输出：项目目录、Monorepo 结构、package 依赖、pnpm workspace、开发规范、commit 规范、branching strategy、API 规范、lint 规范、code review 规范。

---

## 十一、推荐目录结构

```
/apps
  /teams-tab  /teams-bot  /game-server  /admin-panel  /ai-service
/packages
  /game-engine  /shared-types  /socket-protocol  /adaptive-cards  /teams-sdk-wrapper
/infrastructure
  /docker  /azure  /bicep  /terraform
/docs
```

---

## 十二、Copilot CLI 工作流

1. Master Orchestrator Agent — 初始化项目结构。
2. Architect Agent — 生成架构。
3. Rules Agent — 规则引擎。
4. Socket Agent — 联机系统。
5. Frontend Agent — 游戏页面。
6. AI Agent — AI 对战模块。

---

## 十三、通用增强 Prompt

所有代码：必须 TypeScript、严格类型、模块化、可测试、避免循环依赖、支持微服务化、高并发、多人协同、输出完整代码、不允许伪代码、不允许省略核心逻辑。

---

## 十四、Agent 分工

Architect / Rules / Socket / Frontend / AI / Database / DevOps / QA / Security / Replay / Spectator / Referee。

---

## 十五、未来可扩展方向

AI 解说、AI 陪练、语音聊天、视频直播、赛事系统、小程序、Electron、Steam、AI 复盘、出牌建议、数据分析、俱乐部、OpenAPI、第三方插件。

---

## 十六、开发顺序

- **MVP**：登录、房间、发牌、出牌、胜负、WebSocket、简单 UI。
- **第二阶段**：AI、排行榜、回放、观战、裁判。
- **第三阶段**：高并发、Kubernetes、微服务、赛事系统、商业化。

---

## 十七、最终目标

企业级 Microsoft Teams 掼蛋平台、多 Agent 自动开发体系、AI 自动陪玩 / 赛事平台、可商业化运营、可扩展棋牌娱乐基础设施。
