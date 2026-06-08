# AppSource 上架准备清单（Microsoft Teams 掼蛋平台）

> 本文档为 Phase 4 Sprint 1 产物，统一 Teams App 提交至 Microsoft AppSource (Partner Center) 之前需要完成的资料、合规检查与运营准备。每个条目在实际提交前必须由对应 Owner 复核签字（见 §8 Sign-off）。
> 参考：[Publish to AppSource](https://learn.microsoft.com/microsoftteams/platform/concepts/deploy-and-publish/appsource/publish)、[Teams Store validation guidelines](https://learn.microsoft.com/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines)。

---

## §1 提交所需的资产清单（Asset Checklist）

| 资产 | 规格 | 当前状态 | Owner |
| --- | --- | --- | --- |
| App icon (color) | 192×192 PNG，透明背景，无文字版本 | ⏳ 待设计 | Design |
| App icon (outline) | 32×32 PNG，纯白前景 + 透明背景 | ⏳ 待设计 | Design |
| Long description (EN) | 500–4000 字符，含 GDPR / 数据使用声明 | ⏳ 待撰写 | PM |
| Long description (zh-CN) | 同上 | ⏳ 待撰写 | PM |
| Short description | ≤ 80 字符 | ⏳ 待撰写 | PM |
| Screenshots | 1366×768 PNG/JPG，最少 3 张、最多 5 张 | ⏳ 待截图 | Design |
| 视频演示 | YouTube 公开链接，60–120s | 🟡 可选 | Marketing |
| Privacy URL | 公网 HTTPS 永久链接 | ⏳ 待发布（见 §4） | Legal |
| Terms of Use URL | 公网 HTTPS 永久链接 | ⏳ 待发布（见 §5） | Legal |
| Support URL | 公网帮助页 / 工单入口 | ⏳ 待发布 | Support |
| Publisher domain | 已在 Partner Center 中通过 DNS TXT 验证 | ⏳ 待 DNS 验证 | DevOps |
| App package (.zip) | 含 `manifest.json` + 两个 icon，schema v1.17+ | ✅ 雏形见 `appPackage/manifest.json`，待补全 | Server/DevOps |

---

## §2 Manifest 审核清单（`appPackage/manifest.json`）

| 字段 | 当前值 / 状态 | 必改动作 |
| --- | --- | --- |
| `manifestVersion` | `1.17` | 与最新 Teams platform 文档对齐；如升级到 1.19 需重测 SDK |
| `id` | 占位 GUID | 提交前替换为 Partner Center 分配的 App ID |
| `developer.name` / `mpnId` | TODO | 填写发布主体名称 + Microsoft Partner Network ID |
| `developer.websiteUrl` | TODO | 公网官网 |
| `developer.privacyUrl` | TODO | 与 §4 隐私声明 URL 一致 |
| `developer.termsOfUseUrl` | TODO | 与 §5 服务条款 URL 一致 |
| `validDomains` | 当前包含本地 dev 域名 | 提交前仅保留生产 HTTPS 域名（不允许 `*.ngrok.io` / `localhost`） |
| `webApplicationInfo` | `id`/`resource` 占位 | 替换为 Azure AD 应用注册的 client ID + `api://<host>/<id>` |
| `permissions` / `devicePermissions` | `identity`, `messageTeamMembers` | 不申请超出实际需要的设备权限（避免审核驳回） |
| `staticTabs` / `configurableTabs` | 含游戏 Tab + Meeting Side panel | 截图全部 tab 入口；确认 `scopes` 与说明文案匹配 |
| `bots` | TODO 接入 Bot Framework | 若 v1 不上 Bot，移除该字段；否则填写 `botId` + `scopes` |

> 自动化校验：CI 增加 `teamsapp validate` 步骤（已在 §3 待办）。

---

## §3 合规与安全审查（Compliance & Security Review）

- [ ] **数据流图**：补充至 `docs/01-architecture.md`，标明 Teams Client ↔ Game Server ↔ PostgreSQL / Redis 的数据出入境与字段。
- [ ] **数据驻留**：明确生产数据存于哪个 Azure region（推荐与租户主域同 region），在隐私声明中披露。
- [ ] **PII 清单**：仅采集 Teams `aad.objectId` + `displayName`，不存储邮箱 / 通讯录；写入 §4 隐私声明。
- [ ] **GDPR DSR**：实现 `/admin/v1/users/:aad/erase` 数据删除接口（Phase 4 Sprint 2 lane）。
- [ ] **Microsoft Cloud Deployment Model (Govt / GCC)**：v1 仅申请 Commercial cloud。
- [ ] **Microsoft 365 Certification**：v1 申请 **Publisher Attestation**；二期再走 365 Certification。
- [ ] **Penetration test**：v1 暂不强制；Publisher Attestation 中如实勾选 "self-attested"。
- [ ] **依赖漏洞扫描**：`pnpm audit --prod` 必须 0 high/critical（CI 已覆盖）。
- [ ] **第三方服务披露**：列出 OpenAI / Azure OpenAI / Application Insights 等数据出境点。

---

## §4 隐私声明（Privacy Statement）骨架

> 完整副本由 Legal 在 `docs/legal/privacy.md` 维护（Phase 4 Sprint 2 lane）；本节列必需章节。

1. **数据控制者** —— 发布主体公司名 + 注册地址 + DPO 邮箱。
2. **采集的数据类别**
   - 账号：Teams `aad.objectId`、`displayName`、`tenantId`
   - 游戏：房间 ID、出牌事件、聊天消息（仅用于回放与反作弊）
   - 诊断：客户端错误日志（脱敏 stack trace）
3. **使用目的**：撮合对战 / 排行榜 / 反作弊 / 客服。
4. **法律依据**（GDPR Art.6）：合同履行 + 合法利益。
5. **存储期限**：账号永久；对局回放 90 天；诊断日志 30 天。
6. **共享方**：Azure (Microsoft)、OpenAI（如启用 AI 解说，明确告知出境）。
7. **跨境传输**：列出涉及国家 + SCC / DPA 链接。
8. **用户权利**：访问 / 更正 / 删除 / 数据可携；提供 `privacy@<domain>` 邮箱与 30 天响应承诺。
9. **Cookie 与本地存储**：仅必要 cookie（Teams SSO token 缓存），不投放第三方广告 SDK。
10. **未成年人保护**：声明面向企业 Teams 用户，不主动面向 < 13 岁儿童。
11. **变更通知**：变更前 30 天通过 Teams Activity Feed 推送。

---

## §5 服务条款（Terms of Use）骨架

> 完整副本由 Legal 在 `docs/legal/terms.md` 维护。

1. 接受条款 / 主体定义 / 适用范围
2. 许可授予（订阅期内、非排他、不可转让）
3. 用户行为准则（禁止作弊 / 自动化脚本 / 商业转售）
4. 账号与数据所有权（用户保留对局数据所有权，授予运营方使用许可）
5. 付费与退款（v1 免费；预留付费档说明位）
6. SLA 与不可抗力（无 SLA 承诺，best-effort）
7. 知识产权（商标 / Logo / 牌面美术）
8. 责任限制
9. 终止条款
10. 争议解决（适用法律 / 仲裁地）
11. 联系方式

---

## §6 提交前 Smoke Test 流程

1. 在干净 Teams 租户中 sideload `appPackage/<build-id>.zip`。
2. **Personal scope**：打开个人 Tab → 创建房间 → 邀请第二账号加入 → 完成一局（机器人对战）→ 看到结算与回放入口。
3. **Group chat scope**：在测试群发送 `@掼蛋 开局` → Bot 回复 Adaptive Card → 4 人完成报名 → 进房游戏。
4. **Meeting scope**：开会议 → 添加掼蛋 Meeting Tab → 观战模式正常显示牌桌状态。
5. **断网恢复**：游戏中关闭网络 30 秒再恢复 → 客户端能 reconnect 并对齐状态。
6. **AAD SSO**：在新租户首次打开 Tab → 弹出同意对话框 → 同意后可正常进入。
7. **Tenant admin install**：用 Teams 租户管理员账号在 "Manage apps" 上传并审批，验证 admin consent 流程。
8. 录制以上 7 项的截图 / 短视频，归档至 `docs/legal/release-evidence/v0.1/`。

---

## §7 提交流程 Run Book

1. **预审**：内部 PM + Legal + DevOps 三方签字（见 §8）。
2. **Partner Center**：登录 [partner.microsoft.com](https://partner.microsoft.com)，选择 Teams App 提交通道。
3. 上传 `.zip` 包、所有截图、隐私 / 条款 / 支持 URL。
4. 填写测试账号：提供 **Teams 测试租户的两个测试账号** + 操作说明（覆盖 §6 Smoke 流程）。
5. 选择上架地区（v1：Worldwide）。
6. 提交后初审约 5–7 工作日；如被驳回按反馈修复后 24h 内重提。
7. 上架后启用 Application Insights 看板监控首批安装；准备热修分支 `hotfix/appsource-v1`。

---

## §8 Sign-off

| 角色 | 姓名 | 日期 | 状态 |
| --- | --- | --- | --- |
| Product Manager | _TBD_ | _YYYY-MM-DD_ | ⏳ |
| Engineering Lead | _TBD_ | _YYYY-MM-DD_ | ⏳ |
| Legal / Compliance | _TBD_ | _TBD_ | ⏳ |
| DevOps / Security | _TBD_ | _YYYY-MM-DD_ | ⏳ |
| Publisher (Partner Center admin) | _TBD_ | _YYYY-MM-DD_ | ⏳ |

> 所有 Sign-off 完成且 §1 / §2 / §3 全部 ✅ 后，方可在 Partner Center 点击 "Submit for review"。
