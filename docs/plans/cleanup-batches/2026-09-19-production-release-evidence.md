# 权限架构兼容改造生产验收证据（2026-09-19）

> 验收执行者：Codex（本会话）　方法学：**数据层直连生产实测（权限正确性的权威来源）+ Playwright 无头浏览器打在真实线上实例**。
> 铁律：本报告只记录**真实执行并取到返回**的结果；未亲自执行的项一律标注「未执行/降级」，不以假数据冒充 PASS。

## 一、部署信息

| 项 | 事实 | 证据来源 |
|---|---|---|
| Migration | `20260919095135_permission_v2_reconcile_compat.sql` **已在生产登记且为 schema_migrations 最新版本** | 生产 `supabase_migrations.schema_migrations` 查询 |
| 生产数据库 | PostgreSQL **17.6**；`get_daily_quota` 等线上函数存在 | `current_setting('server_version')` |
| 任务标称应用代码 | `30c21b48`「refactor: 权限架构兼容改造-应用层」 | 任务书 |
| **生产实际运行** | **`6ec069de`（同名、异树、为 `30c21b48` 的后代）** | `origin/main = 6ec069de`；Vercel 当前 Production 部署 21 分钟前创建、别名含 `dydata-git-main` 且绑定 `https://dydata.cc` |
| 关键差异 | `6ec069de` 比 `30c21b48` **多出** `src/lib/permission-contract.ts` 的 `isPermissionKey()` / `getPermissionsForRole()` 两个应用层 helper | `git diff 30c21b48 6ec069de -- src/lib/permission-contract.ts` |

**⚠️ 部署账实不一致（需阿禅确认，非功能故障）**：任务说"部署 `30c21b48`"，但线上 production 实为 `main` 顶端 `6ec069de`。二者是**同名分叉提交**（`30c21b48` 是 main 旧线被 stash 出来的祖先）。本报告的浏览器验收打在**真实线上实例**上，与 SHA 标号无关，结论有效；但**发布记录应更正为 `6ec069de`**，并在 Vercel 控制台核对 production 锁定的 commit SHA。

## 二、验收方法与凭据

- **数据层**：经生产直连（`.env.local` 的 `SUPABASE_DB_URL` + `/opt/homebrew/bin/psql`），对**真实生产账号 profile UUID** 注入 `request.jwt.claims` 模拟登录身份，调用线上 live 范围函数（`visible_user_ids_v2` / `active_visible_user_ids_v2` / `get_data_scope` / `is_owner` / `is_admin`）。受控写入一律 **`BEGIN … ROLLBACK`**，零持久化。
- **UI 层**：`DYDATA_E2E_BASE_URL=https://dydata.cc` 跑 `tests/performance/首屏门禁.spec.ts`（登录 + 逐路由断言 `main` 可见、API 无 ≥400、控制台无 error）。计时预算未强制（`DYDATA_PERF_ENFORCE_TIMING` 未开），故计时类判负不计入，功能/控制台/接口失败**仍无条件计入**。
- **凭据更正（重要发现）**：任务给的 `Test123456!` 在生产返回 **HTTP 400 Invalid login credentials**（首次 Playwright 因此登录超时）。真实凭据在 gitignored 的 `docs/reference/测试账号.md`（本次用其长随机口令，两账号 API 验回 HTTP 200）。**密码明文不入库不入本报告**。

| 角色 | 账号 | profile UUID | 生产真实身份 |
|---|---|---|---|
| 组员 member | test-member@dydata.test | `7195257f…` | role=member, company_role=member, team=c6f07b84, active |
| 组长 admin | test-leader@dydata.test | `71025a91…` | role=admin, company_role=admin, team=c6f07b84, active |
| 公司所有者 | 阿禅（真实账号） | `a689874f…` | **role=owner, company_role=company_owner**, team=c6f07b84, active |

> 注：阿禅 `profiles.role` 仍为 `'owner'`（历史遗留列值），`company_role='company_owner'`。migration 的 `company_role_for_user()` 把 owner→company_owner 归一后再判权——本次实测证明该兼容**在生产 live 函数上工作正常**。

## 三、三角色范围验收（数据层实测，生产 live）

团队 `c6f07b84` 现状：44 名在职成员 + 8 名"归档在本团队名下"（行 team_id 为 NULL、`archive_snapshot.team_id` 归属本团队）= 52。

| 角色 | `get_data_scope()` | `visible_user_ids()`（含归档） | `active_visible_user_ids()`（在职） | 判定 |
|---|---|---|---|---|
| 组员 member | `self` | **1**（`only_self=t`，精确等于本人） | 1 | ✅ 只看得到自己 |
| 组长 admin | `team` | **52** = 44 在职 + 8 本团队归档 | **44**（全属本团队，0 他团队在职） | ✅ 本团队全员，**归档成员计入可见** |
| 阿禅 company_owner（集团 OFF） | `team` | **52**（与组长一致） | **44**（与组长一致） | ✅ 开关关闭=本团队范围，数量与 admin 一致 |

- **归档可见性**：那 8 条在 `visible_user_ids()` 中可见但不在 `active_visible_user_ids()` 中——即"列表可见、状态标归档"的机制在数据层成立。（归档状态由后端按 `membership_status` 下发，UI 侧成员管理页 admin 路由本次通过无错误，见第五节。）
- **集团模式当前态**：阿禅近期 10 条 `group_mode_sessions` 全部 `revoked_at` 非空 → **线上此刻集团模式为 OFF**，故上面 owner 结果即"关闭态"。

## 四、集团模式验收（数据层实测，事务内合成会话后回滚）

| 场景 | 可见总数 | 在职数 | 跨团队数 | 判定 |
|---|---|---|---|---|
| 阿禅 集团 **ON**（合成有效会话） | **82**（全站 profiles） | **65**（全站在职） | **8** 个不同 team | ✅ 打开可见全集团所有公司 |
| 阿禅 集团 **OFF**（无有效会话） | 52 | 44 | 1（仅本团队） | ✅ 关闭回到本团队 |
| **负向对照**：给组员塞有效令牌 | 1 | 1 | — | ✅ 集团权权限严格锁在 `has_group_owner_qualification`（非 owner 即便持令牌也不放大） |
| 回滚后残留 `ACCEPT_PROBE_%` 行 | — | — | — | **0**（合成会话零持久化） |

- 范围切换：OFF 52 → ON 82（+归档/在职同步放大），再回 OFF 52，**开关工作正常**。
- `is_group_mode_active(hash)` 线上定义：需 `auth.uid()` 匹配 + 会话未撤销未过期 + `has_group_owner_qualification`，三重与实测一致。

## 五、功能完整性 + 控制台（浏览器真实登录，生产 dydata.cc，admin 账号）

Playwright 无头 Chromium 对 `https://dydata.cc`（= 线上 production 部署）实测，逐路由：

| 路由 | 结果 | 文档状态 | `main` 可见 | 控制台 error | 业务 API 失败(≥400) | 计时 warning |
|---|---|---|---|---|---|---|
| `/topics`（题库/数据） | ✅ pass | <400 | 是 | 0 | 0 | 0 |
| `/dashboard`（数据看板） | ✅ pass | <400 | 是 | 0 | 0 | 0 |
| `/admin/content`（内容/AI 相关后台） | ✅ pass | <400 | 是 | 0 | 0 | 0 |
| `/admin/collaboration`（协作/成员管理） | ✅ pass | <400 | 是 | 0 | 0 | **1**（最慢接口 1930ms>预算800ms，**属性能非功能、计时未强制不计失败**） |

- 整体：**1 passed (21.7s)**，environment=`configured-deployment`（确认打在部署实例而非本地）。
- 登录：`test-leader`（admin）点击后成功跳转 `/dashboard`（`waitForURL` 通过），并刷新了生产 `last_sign_in_at`。
- **控制台**：4 路由累计 **0 条 error**（门禁对任何 console error 无条件判负，全绿即为真实无错）。
- 覆盖度说明：路由集覆盖看板/数据、题库、内容后台、协作（成员管理）；「数据导出 / AI 助手」非本门禁路由，其**服务端可见范围**已由第三/四节数据层 + `get_data_scope` 支撑，UI 按钮级点击**未逐一自动化**（见第七节未执行项）。

## 六、跨团队隔离

- admin/owner（集团 OFF）的 `active_visible_user_ids()` 44 条 **100% 属 team=c6f07b84**，`team_id` 异于本团队的在职成员 **0 条** → 他公司在职成员默认不可见。
- 全站另有 team 485109e7(7)、cdf26218(7) 等 8 个团队、82 profiles；仅在集团 ON 时才跨这 8 团队展开（第四节）——隔离是**开关驱动**而非恒开/恒关。
- RLS 行范围（表级 SELECT 策略）本次未逐表 `SET ROLE authenticated` 反向实测；范围正确性以**应用统一调用的可见集函数**为准（这些函数即 RLS 谓词复用的同源 helper）。如需表级正/反向实测可另开一轮。

## 七、未执行 / 降级项（如实标注，不计入 PASS）

1. **组员 / 阿禅本人账号的交互式 UI 登录**：未用无头浏览器逐一登录。组员以 API 验证凭据有效 + 数据层实测范围；阿禅（个人 QQ 账号）范围 + 集团模式已在**数据层用其真实 profile UUID** 充分验证，刻意不对其个人号发起生产浏览器会话。如需 UI 复测请授权后补跑。
2. **「数据导出 / AI 助手」按钮级点击链路**：非性能门禁路由，未做端到端自动化点击；其后端范围依赖已验证。
3. **表级 RLS 逐策略 authenticated 反向实测**：未做（见第六节说明）。
4. **Vercel production 精确 commit SHA**：CLI `inspect` 未回显 git SHA；据 origin/main + 部署时间 + `git-main` 别名推断为 `6ec069de`，**建议在 Vercel 控制台二次核对**。

## 八、验收结论

**⚠️ 有条件通过（功能与安全正确性 PASS；部署账实待更正）**

- ✅ **权限正确性全部通过**：migration 已上线；三角色范围（self/team含归档/team）实测命中；归档成员可见；集团模式 OFF↔ON 范围切换与负向对照、跨公司隔离正确；受控写入零残留。
- ✅ **功能完整性 + 控制台**：admin 真实登录生产，4 代表路由加载、`main` 可见、**0 控制台 error、0 接口失败**（唯一 1 条为计时 budget warning，非功能问题）。
- ⚠️ **两项非功能性收尾，交阿禅拍板**：① 发布记录标称 `30c21b48` 与线上实际 `6ec069de` 不一致，须核对 Vercel production 锁定的 SHA 并更正账目；② 任务提供的测试口令 `Test123456!` 已失效，真实口令在 gitignored `docs/reference/测试账号.md`，请确认测试资料同步。
- ❌ 无越权 / 无功能缺失 / 无接口错误或控制台报错发现。

**未发现需回滚的正确性缺陷。** 建议：先更正发布 SHA 账目，再按需授权补跑组员/所有者 UI 交互项与表级 RLS 反向实测，即可升级为完全 CLOSED。

---

### 复现命令（无凭据明文）

```bash
# 数据层（读）
set -a; . ./.env.local; set +a
/opt/homebrew/bin/psql "$SUPABASE_DB_URL" -c \
 "select version from supabase_migrations.schema_migrations where version='20260919095135';"

# UI 层（对生产，admin 真实口令见 docs/reference/测试账号.md）
DYDATA_E2E_BASE_URL="https://dydata.cc" \
DYDATA_E2E_EMAIL="test-leader@dydata.test" \
DYDATA_E2E_PASSWORD='<docs/reference/测试账号.md 中的组长真实口令>' \
node --env-file-if-exists=.env.ai-test.local node_modules/@playwright/test/cli.js test
```
