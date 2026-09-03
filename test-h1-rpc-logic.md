# H1 RPC 逻辑验证报告

## 验证目标

验证 `admin_grant_exemption_for_dates` RPC 的逻辑正确性，确保：
1. 使用正确的列名（030 + 20260902100000 的真实表结构）
2. 先检查是否已有 active grant，避免重复授予
3. 创建 grant 后触发投影重算
4. 权限限制为 service_role

## 表结构核对

### exemption_grant 表（030 + 20260902100000）

**030_exemption_tables.sql 定义：**
```sql
create table if not exists public.exemption_grant (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.exemption_request(id),
  user_id uuid references auth.users(id),
  team_id uuid,
  start_date date,
  end_date date,
  grant_type text,
  status text default 'active',
  created_at timestamptz default now()
);
```

**20260902100000 添加：**
```sql
-- 在 insert 中使用了 exemption_category 列
insert into public.exemption_grant (
  request_id, user_id, team_id, start_date, end_date, 
  grant_type, exemption_category, status
)
```

**结论：**
- ✅ 有 `grant_type` 列（不是 Codex 报告的 `exemption_type`/`grant_mode`）
- ✅ 有 `status` 列（不是 `grant_status`）
- ✅ 有 `start_date`/`end_date` 列（不是单独的 `exemption_date`）
- ✅ 有 `exemption_category` 列（20260902100000 添加）

## RPC 逻辑核对

### 1. 列名正确性 ✅

**新 RPC 使用的列名：**
```sql
insert into public.exemption_grant (
  request_id,      -- ✅ 030 定义
  user_id,         -- ✅ 030 定义
  team_id,         -- ✅ 030 定义
  start_date,      -- ✅ 030 定义（单日豁免 start_date = end_date）
  end_date,        -- ✅ 030 定义
  grant_type,      -- ✅ 030 定义（旧代码错误使用 exemption_type）
  exemption_category, -- ✅ 20260902100000 添加
  status           -- ✅ 030 定义（旧代码错误使用 grant_status）
)
```

**旧代码错误使用的列名（data-correction.ts）：**
```typescript
// ❌ 这三个列都不存在
exemption_type   // 应为 grant_type
grant_mode       // 不存在此列
reason           // grant 表没有 reason 列（只有 request 表有）
```

### 2. 重复检查逻辑 ✅

```sql
select id into v_existing_grant_id
from public.exemption_grant
where user_id = v_user_id
  and start_date = v_date
  and end_date = v_date
  and status = 'active'
limit 1;
```

**正确性：**
- ✅ 按 `user_id + start_date + end_date + status='active'` 检查
- ✅ 单日豁免：`start_date = end_date = v_date`
- ✅ 只检查 active 状态，已撤销的 grant 不影响新授予

### 3. 投影重算逻辑 ✅

**模仿 20260902100000::review_exemption_request_dates_atomically：**
```sql
perform set_config('dydata.exemption_write_authorized', '1', true);
update public.profiles
set
  status = 'active',  -- 单日豁免不改为 exempt
  exempt_type = 'temporary',
  exempt_start_date = (select min(start_date) from public.exemption_grant 
                       where user_id = v_user_id and status = 'active'),
  exempt_end_date = (select max(end_date) from public.exemption_grant 
                     where user_id = v_user_id and status = 'active'),
  exempt_reason = p_reason,
  exemption_category = 'waive'
where id = v_user_id;
```

**正确性：**
- ✅ 使用 `set_config('dydata.exemption_write_authorized', '1')` 绕过 profiles 约束
- ✅ 动态计算 `exempt_start_date` / `exempt_end_date`（覆盖该用户所有 active grant 的日期范围）
- ✅ 单日豁免不把 `status` 改为 `'exempt'`，只标记 `exempt_type='temporary'`
- ✅ 与审批流程的投影逻辑一致

### 4. 权限限制 ✅

```sql
revoke all on function public.admin_grant_exemption_for_dates(uuid[], date[], text, text) 
  from public, anon, authenticated;
grant execute on function public.admin_grant_exemption_for_dates(uuid[], date[], text, text) 
  to service_role;
```

**正确性：**
- ✅ 只有 `service_role` 可调用
- ✅ 与 `createAdminClient()` 权限对齐
- ✅ 普通用户和匿名用户无法调用

## 与旧代码对比

| 项目 | 旧代码（data-correction.ts） | 新 RPC | 状态 |
| --- | --- | --- | --- |
| profiles 直写 | ✅ 直接 update profiles | ❌ 通过 grant + 投影 | ✅ 修复 |
| grant 列名 | ❌ exemption_type/grant_mode/reason | ✅ grant_type/status | ✅ 修复 |
| 重复检查 | ❌ 无 | ✅ 有 | ✅ 修复 |
| 失败处理 | ❌ .then(()=>{},()=>{}) 静默吞掉 | ✅ RPC 抛错 | ✅ 修复 |
| 投影一致性 | ❌ profiles 与 grant 可能分叉 | ✅ 投影重算 | ✅ 修复 |

## 潜在风险

### 1. exemption_category 列是否存在 ⚠️

**问题：** 20260902100000 添加 `exemption_category` 列，但没有 `ALTER TABLE` 语句，只在 insert 中使用。

**风险：** 如果 030 → 20260902100000 之间有其他 migration 没有添加该列，insert 会失败。

**缓解：** 需要在生产环境验证 `exemption_grant` 表是否有 `exemption_category` 列。

### 2. 投影重算时机 ⚠️

**问题：** 投影重算只在 `v_granted_count > 0` 时触发，且只更新最后一个 `v_user_id`。

**风险：** 如果传入多个用户，只有最后一个用户的投影会被更新。

**修复建议：** 将投影重算移到 `foreach v_user_id` 循环内部，每个用户授予后立即更新。

### 3. team_id 可能为空 ⚠️

**问题：** 如果 `profiles.team_id` 为 null，grant 记录的 `team_id` 也会是 null。

**风险：** 部分业务查询可能依赖 `team_id` 过滤，null 值会被漏掉。

**缓解：** 审批流程也是同样写法（20260902100000），应该是允许的。

## 修复建议

### 高优先级：投影重算时机

```sql
-- 当前逻辑（有 bug）
foreach v_user_id in array p_user_ids
loop
  -- ... 授予 grant ...
end loop;

-- 只在循环结束后更新最后一个 v_user_id 的投影 ❌
if v_granted_count > 0 then
  update public.profiles ... where id = v_user_id;  -- v_user_id 是循环变量，退出后是最后一个
end if;

-- 应改为（每个用户授予后立即更新投影）
foreach v_user_id in array p_user_ids
loop
  declare
    v_user_granted_count integer := 0;
  begin
    foreach v_date in array p_dates
    loop
      -- ... 授予 grant ...
      if <授予成功> then
        v_user_granted_count := v_user_granted_count + 1;
      end if;
    end loop;
    
    -- 每个用户授予后立即更新投影 ✅
    if v_user_granted_count > 0 then
      perform set_config('dydata.exemption_write_authorized', '1', true);
      update public.profiles ... where id = v_user_id;
    end if;
  end;
end loop;
```

### 中优先级：exemption_category 列存在性

生产环境验证：
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'exemption_grant' 
  AND column_name = 'exemption_category';
```

如果不存在，需要先执行 migration 添加该列。

## 结论

**逻辑层面：** ✅ RPC 逻辑基本正确，使用了正确的列名和投影重算流程

**实现层面：** ⚠️ 有 1 个高优先级 bug（投影重算时机）需要修复

**验证层面：** ⚠️ 无法在本地数据库验证（037 migration 错误导致 supabase start 失败）

**建议：**
1. 先修复投影重算时机 bug
2. 生产环境执行前，先验证 `exemption_category` 列是否存在
3. 执行后测试多用户、多日期场景，确认投影正确
