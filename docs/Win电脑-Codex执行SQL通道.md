# Win 电脑 Codex 执行 SQL 通道配置

> 阿禅：这份文档是给 Win 电脑上的 Codex 看的。打开 Codex 后把它丢进去，说「按这个配置 SQL 通道」就行。配完以后 Codex 也能像 Mac 端 Claude 一样，直接执行数据库改动（建函数、建表、跑 migration），× 再卡在 service_role 不够权限。

---

## 给 Codex 的指令

阿禅这台 Win 电脑只有 `SUPABASE_SERVICE_ROLE_KEY`，它能读写数据但 × 能执行 DDL（CREATE/ALTER/DROP）。本次任务是给你补两条权限通道，配完即可独立执行 migration。

### 通道一：数据库直连串（必配，应急 / 临时 SQL 用）

第一步，让阿禅登录 Supabase Dashboard：
- 项目页面顶部 `Connect` 按钮
- 选 `Connection string` 标签 → `Session pooler`（× 选 Direct，移动网络容易中断）
- 复制 URI 整段

第二步，让阿禅拿数据库密码：
- 左侧 `Project Settings` → `Database`
- 找 `Database Password` 区块，× 记得就点 `Reset database password` 重置一个新的（重置 × 影响线上服务）
- 把密码替换 URI 里的 `[YOUR-PASSWORD]`

第三步，把完整 URI 写进 Win 项目根目录的 `.env.local`（× commit 到 git）：

```
SUPABASE_DB_URL=postgresql://postgres.mkkvnogkqcupvxmnoefy:真实密码@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

第四步，验证通道可用。Win 上装 `psql`（如果没有，用 node 替代见后文）：

```bash
psql "$SUPABASE_DB_URL" -c "SELECT current_user, current_database();"
```

应返回 `postgres.mkkvnogkqcupvxmnoefy / postgres`。

如果阿禅 Win 没装 psql 也 × 想装，用 node 一键替代，新建脚本 `scripts/run-sql.mjs`：

```javascript
import { Client } from "pg";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/run-sql.mjs <file.sql>"); process.exit(1); }

const sql = readFileSync(file, "utf8");
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await c.connect();
const res = await c.query(sql);
console.log("OK", Array.isArray(res) ? res.length : res.rowCount, "statement(s)");
await c.end();
```

之后执行 migration 一行命令：

```bash
node scripts/run-sql.mjs supabase/migrations/xxx.sql
```

### 通道二：Personal Access Token + Supabase CLI（推荐，标准 migration 流程）

第一步，让阿禅生成 token：
- Dashboard 右上角头像 → `Account` → `Access Tokens` → `Generate new token`
- 命名 `windows-codex`
- 复制 token（只显示一次）

第二步，写进 Win 项目 `.env.local`：

```
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxx
```

第三步，Win 终端装 CLI 并关联项目：

```bash
npm i -g supabase
supabase link --project-ref mkkvnogkqcupvxmnoefy
```

CLI 会自动读取 `SUPABASE_ACCESS_TOKEN` 完成认证。

第四步，验证：

```bash
supabase migration list --linked
```

应能看到所有已执行 / 未执行的 migration 列表。

### 之后日常使用规则

| 场景 | 用哪条通道 | 命令 |
|------|----------|------|
| 临时跑一段 SQL（debug、查数据） | 通道一 | `node scripts/run-sql.mjs file.sql` |
| 推一份新写的 migration 到线上 | 通道二 | `supabase db push --linked` |
| 回滚某个函数 / 删除某张表 | 通道一 | 直接连 psql 写 DROP |
| 查线上 schema 状态 | 通道二 | `supabase db diff --linked` |

**硬规则**：

- × 用 `service_role` 当数据库密码，会报 `password authentication failed`
- × 把 `.env.local` commit 到 git（`.gitignore` 已屏蔽，但 git add 前自检一眼 `git status`）
- × 用 `supabase db push --include-all` 一把推全部 migration，全局规则禁止
- × 写 `exec_sql` 这种万能 RPC 函数走 service_role 绕 DDL，全局规则禁止

### 安全提醒（给阿禅）

阿禅，DB_URL 和 ACCESS_TOKEN 一旦泄露：

- **DB_URL 泄露** → Dashboard 重置 Database Password，旧密码立刻失效，所有用旧串的代码报错（你立即让 Codex 把新密码同步进 `.env.local`）
- **ACCESS_TOKEN 泄露** → Dashboard `Account → Access Tokens` 找到对应 token，点 Revoke，立刻失效

平时把这两个值存到坚果云加密目录或 1Password 一份，× 截图丢微信、× 贴在记事本桌面。
