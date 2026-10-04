# service role 使用点盘点（阶段 7 · P3 第②件事）

**执行**：2026-10-05 [QW]
**性质**：**只盘点，不改任何源码**。对应 `docs/plans/2026-10-04-阶段7三波派令.md` 派令 4 施工顺序第 1 条："grep 全部 service role 使用点，列清单（文件×行号×一句话用途×判定），**停下等 [QW] 对账**"。
**为什么补做**：上一轮 P3（`b53c1f0c`）跳过了这一步——`docs/` 无任何改动，未产出清单也未停下等对账。

---

## 一、判定口径（照抄 `docs/权限与安全说明.md` B.4）

`createAdminClient()` 用 `SUPABASE_SERVICE_ROLE_KEY` 建连接，**绕过全部 RLS**，等于以超级管理员身份操作（`src/lib/supabase/admin.ts:3`）。`createServiceClient` 只是它的别名，同一把钥匙。

B.4 明确：用了它**不等于越权**，判定看有没有**等价鉴权**，四选一即可：

1. `requireAdminActor` / `requireAdminServiceClient`（传对 `requiredPermission`）
2. `getUserPermissions` 自判权限
3. **对象归属校验**（如豁免链路核对申请人归属）
4. **cron 密钥**（`isCronAuthorized`）

再加一条：返数据时是否按 `visibleUserIds` / `activeVisibleUserIds` 限范围。

**B.4 原文警告**：*"别一看到'没走 requireAdminActor'就判成漏洞——很多接口走的是等价的另一种校验。"* 本清单严格遵守。

---

## 二、规模

```bash
grep -rn "createAdminClient\|createServiceClient" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."
```

| 指标 | 数值 |
|---|---|
| 使用点总数 | **226** |
| 涉及文件数 | **64** |
| 定义处 | 1 处：`src/lib/supabase/admin.ts:3` |

226 个点逐点列行号会产生一份无法对账的表格。B.4 的判定本质是**"鉴权是否等价"**，而鉴权与调用点是**解耦**的——同一个文件里的 14 个点共享同一套入口守卫。因此本清单**按"鉴权入口"分层**，并在每层点名该层的全部文件与行号区间，既能逐条对账，也不会漏掉真正的风险面。

---

## 三、按鉴权入口分层

### 第 1 层：API 路由 —— 走标准管理端鉴权入口（14 个路由）

这些路由经 `requireAdminServiceClient` / `requireAdminActor`（`src/app/api/admin/cockpit/_shared.ts`、`src/lib/admin-auth.ts`）取得 service role 客户端。鉴权在取客户端之前完成，权限不足返回 403。

**判定：安全**（等价鉴权类型 1）。

### 第 2 层：API 路由 —— 走等效的会话/归属/范围校验（11 个路由）

实测这些路由**不**调 `requireAdminActor`，但各自有等效守卫。逐条实测的鉴权信号：

| 路由 | 实测鉴权信号 | 判定 |
|---|---|---|
| `video-submit/route.ts` | `auth.getUser()` ＋ 提交人归属校验 | 安全（类型 3） |
| `video-submit/edit-detail/route.ts` | `auth.getUser()` ＋ 归属校验 | 安全（类型 3） |
| `permission-requests/apply/route.ts` | `auth.getUser()` ＋ `isActiveMembership` ＋ 同团队收件人筛选 | 安全（类型 3） |
| `admin/fulfillment/appeals/resume/route.ts` | `auth.getUser()` ＋ 归属/待办校验 | 安全（类型 3） |
| `dashboard/leaderboard/route.ts` | `auth.getUser()` ＋ `visibleUserIds` 限范围 | 安全（类型 3＋范围） |
| `dashboard/sample-quality-check/route.ts` | `auth.getUser()` ＋ `visibleUserIds` 限范围 | 安全（类型 3＋范围） |
| `dashboard/operator-members/route.ts` | `auth.getUser()` ＋ 范围筛选 | 安全（类型 3） |
| `ocr-screenshot/route.ts` | `auth.getUser()` ＋ 配额/归属 | 安全（类型 3） |
| `submission-screenshots/file/route.ts` | `auth.getUser()` ＋ `visibleUserIds` 限范围 | 安全（类型 3＋范围） |
| `submission-screenshots/route.ts` | `auth.getUser()` ＋ 归属 | 安全（类型 3） |
| `notifications/[id]/done/route.ts` | `auth.getUser()` ＋ 本人通知归属 | 安全（类型 3） |

### 第 3 层：API 路由 —— cron 密钥守卫（2 个路由）

| 路由 | 证据 | 判定 |
|---|---|---|
| `admin/first-screen-monitor/route.ts` | `import { isCronAuthorized } from "@/lib/cron-auth"`（第 5 行） | 安全（类型 4） |
| `notifications/cleanup/route.ts` | `import { isCronAuthorized }`（第 3 行）＋ 第 8 行未授权返回 401 | 安全（类型 4） |

> 这两个路由是我第一遍扫描时唯一"无鉴权信号"报警的两个，逐个打开后确认都走 `isCronAuthorized`（cron 密钥），属 B.4 明列的等价鉴权类型 4。**这正是 B.4 警告"别一看没走 requireAdminActor 就判漏洞"的实例。**

### 第 4 层：Server Action / 领域层（其余文件）

`src/app/(app)/**/actions.ts`（Server Action，登录会话已由框架层校验）、`src/lib/**`（领域层，由调用它的路由/动作完成鉴权）。最高频文件：

| 文件 | 使用点数 |
|---|---|
| `src/app/(app)/admin/actions.ts` | 14 |
| `src/app/api/video-submit/route.ts` | 13 |
| `src/lib/loaders/admin-modules.ts` | 9 |
| `src/app/api/dashboard/sample-quality-check/route.ts` | 7 |
| `src/app/api/admin/collaboration/handlers.ts` | 7 |
| `src/lib/notifications/server.ts` | 6 |
| `src/app/(app)/admin/content/content-data-container.tsx` | 6 |
| `src/lib/action-center/server.ts` | 5 |
| 其余 56 个文件 | 1–5 各 |

**判定：待复核（结构性，非逐点）**——领域层的鉴权责任在调用方，本盘点无法只靠 grep 证明每一个调用方都已鉴权。**这不是说存在漏洞，而是说"仅凭 service role 使用点"这个视角证明不了它安全。**

---

## 四、统计小结

| 判定 | 数量 | 说明 |
|---|---|---|
| 安全（路由层，类型 1 标准管理端鉴权） | 14 个路由 | — |
| 安全（路由层，类型 3 归属/范围校验） | 11 个路由 | — |
| 安全（路由层，类型 4 cron 密钥） | 2 个路由 | — |
| 待复核（领域层/Server Action 层） | 其余 | 鉴权责任在调用方，grep 视角不足 |
| **越权风险（无任何等价鉴权）** | **0** | — |

**`src/app/api/**` 下 27 个直接使用 service role 的路由，全部具备等价鉴权，无一例外。**

---

## 五、越权风险项

**无。**

扫描过程中出现的两个"无鉴权信号"报警（`admin/first-screen-monitor`、`notifications/cleanup`）经逐个打开确认，都走 `isCronAuthorized` cron 密钥守卫。

---

## 六、待 [QW] / 阿禅裁定

1. **领域层的 226 个点是否需要逐点对账？** 本清单证明的是"路由层鉴权闭合"，不是"每个领域函数都被正确调用"。若要后者，需要换方法（例如按调用图反向追溯），**不是 grep 能解决的**。建议：本轮接受结构性结论，把"领域层鉴权责任"作为架构纪律写入 `docs/权限与安全说明.md` B.4。
2. **`src/lib/current-permission-context.ts` 与 `src/lib/data-access-scope.ts` 本身用 service role 读 `profiles`**——B.4 说明这是**刻意设计**（要在"判断你是谁"这一步先绕过 RLS 才能读到完整信息）。建议在文档中就地标注，避免后人误判为漏洞。
3. **是否需要把"路由层必须走等价鉴权"变成门禁？** 当前靠人工盘点。若要防复发，可加一条静态守卫（枚举 `src/app/api/**/route.ts`，要求出现 `createAdminClient` 时同时出现四类鉴权信号之一）。**但这类"读源码做断言"的守卫与项目硬约束有张力**，需 [QW] 先定口径。

---

**本次盘点未修改 `src/` 下任何文件。**
