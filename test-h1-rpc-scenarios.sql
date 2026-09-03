-- H1 修复测试脚本：模拟手工豁免场景

-- 场景 1：单用户单日授予
select public.admin_grant_exemption_for_dates(
  p_user_ids := array['<user_uuid_1>']::uuid[],
  p_dates := array['2026-09-04']::date[],
  p_reason := '测试单用户单日授予',
  p_grant_type := 'manual_admin'
);

-- 预期结果：
-- {"granted_count": 1, "skipped_count": 0, "total_requested": 1}

-- 验证：
select id, user_id, start_date, end_date, grant_type, status
from public.exemption_grant
where user_id = '<user_uuid_1>' and start_date = '2026-09-04';

select id, exempt_type, exempt_start_date, exempt_end_date, exempt_reason
from public.profiles
where id = '<user_uuid_1>';

---

-- 场景 2：单用户多日授予
select public.admin_grant_exemption_for_dates(
  p_user_ids := array['<user_uuid_1>']::uuid[],
  p_dates := array['2026-09-05', '2026-09-06', '2026-09-07']::date[],
  p_reason := '测试单用户多日授予',
  p_grant_type := 'manual_admin'
);

-- 预期结果：
-- {"granted_count": 3, "skipped_count": 0, "total_requested": 3}

-- 验证：profiles 的 exempt_start_date 应为 2026-09-04（最早），exempt_end_date 应为 2026-09-07（最晚）
select id, exempt_type, exempt_start_date, exempt_end_date
from public.profiles
where id = '<user_uuid_1>';

---

-- 场景 3：多用户单日授予
select public.admin_grant_exemption_for_dates(
  p_user_ids := array['<user_uuid_1>', '<user_uuid_2>']::uuid[],
  p_dates := array['2026-09-08']::date[],
  p_reason := '测试多用户单日授予',
  p_grant_type := 'manual_admin'
);

-- 预期结果：
-- {"granted_count": 2, "skipped_count": 0, "total_requested": 2}

-- 验证：两个用户的投影都应更新（测试投影重算时机修复）
select id, exempt_type, exempt_start_date, exempt_end_date
from public.profiles
where id in ('<user_uuid_1>', '<user_uuid_2>');

---

-- 场景 4：重复授予（应跳过）
select public.admin_grant_exemption_for_dates(
  p_user_ids := array['<user_uuid_1>']::uuid[],
  p_dates := array['2026-09-04']::date[],  -- 场景 1 已授予
  p_reason := '测试重复授予',
  p_grant_type := 'manual_admin'
);

-- 预期结果：
-- {"granted_count": 0, "skipped_count": 1, "total_requested": 1}

-- 验证：grant 记录数量不变
select count(*) from public.exemption_grant
where user_id = '<user_uuid_1>' and start_date = '2026-09-04';
-- 应仍为 1 条

---

-- 场景 5：不存在的用户（应跳过）
select public.admin_grant_exemption_for_dates(
  p_user_ids := array['00000000-0000-0000-0000-000000000000']::uuid[],
  p_dates := array['2026-09-09']::date[],
  p_reason := '测试不存在的用户',
  p_grant_type := 'manual_admin'
);

-- 预期结果：
-- {"granted_count": 0, "skipped_count": 1, "total_requested": 1}

---

-- 清理测试数据
delete from public.exemption_grant
where user_id in ('<user_uuid_1>', '<user_uuid_2>')
  and grant_type = 'manual_admin'
  and reason like '测试%';

-- 重置 profiles 投影（可选，如果需要恢复原状）
update public.profiles
set exempt_type = null, exempt_start_date = null, exempt_end_date = null, exempt_reason = null
where id in ('<user_uuid_1>', '<user_uuid_2>');
