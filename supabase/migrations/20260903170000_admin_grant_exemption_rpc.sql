-- H1 修复：统一的管理员手工豁免 RPC
-- 替代 data-correction.ts 中直写 profiles + 错误列名 insert exemption_grant 的旧逻辑
-- 问题：
--   1. 直写 profiles 状态为 'exempt' + exempt_type='temporary' 与 030 的 profiles_exemption_fields_check 约束冲突
--   2. insert exemption_grant 使用不存在的列名 exemption_type/grant_mode/reason（真实列是 grant_type）
--   3. 失败被 .then(()=>{},()=>{}) 静默吞掉 → P0-01 "已批准但无 active grant" 缺发错账
-- 解决：
--   1. 使用正确的列名 grant_type（030 定义）
--   2. 先检查是否已有 active grant，避免重复授予
--   3. 创建 grant 后更新 profiles 投影（模仿 20260902100000 的投影逻辑）
--   4. 仅 service_role 可调用（与 createAdminClient 权限对齐）

-- 注意：exemption_grant 表结构来自 030，列为：
--   id, request_id, user_id, team_id, start_date, end_date, grant_type, status, created_at
--   后续 20260902100000 添加了 exemption_category 列
--   没有 exemption_date 或 grant_status 列，Codex 报告的列名是对照 20260902100000 推断的

create or replace function public.admin_grant_exemption_for_dates(
  p_user_ids uuid[],
  p_dates date[],
  p_reason text,
  p_grant_type text default 'manual_admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_date date;
  v_granted_count integer := 0;
  v_skipped_count integer := 0;
  v_existing_grant_id uuid;
  v_target public.profiles%rowtype;
  v_user_granted_count integer;
begin
  -- 遍历用户和日期组合
  foreach v_user_id in array p_user_ids
  loop
    v_user_granted_count := 0;

    -- 获取目标用户信息（team_id 需要写入 grant）
    select * into v_target from public.profiles where id = v_user_id;
    if not found then
      v_skipped_count := v_skipped_count + array_length(p_dates, 1);
      continue;
    end if;

    foreach v_date in array p_dates
    loop
      -- 检查是否已有 active grant（使用 030 的真实列名：start_date、status）
      select id into v_existing_grant_id
      from public.exemption_grant
      where user_id = v_user_id
        and start_date = v_date
        and end_date = v_date
        and status = 'active'
      limit 1;

      if v_existing_grant_id is not null then
        -- 已存在，跳过
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;

      -- 创建 grant 记录（使用 030 + 20260902100000 的真实列名）
      -- request_id 为 null（手工授予无关联申请）
      -- exemption_category 默认 'waive'（模仿审批流程）
      insert into public.exemption_grant (
        request_id,
        user_id,
        team_id,
        start_date,
        end_date,
        grant_type,
        exemption_category,
        status
      ) values (
        null,
        v_user_id,
        v_target.team_id,
        v_date,
        v_date,
        p_grant_type,
        'waive',
        'active'
      );

      v_granted_count := v_granted_count + 1;
      v_user_granted_count := v_user_granted_count + 1;
    end loop;

    -- 投影重算：更新 profiles 的豁免状态（模仿 20260902100000::review_exemption_request_dates_atomically）
    -- 每个用户授予后立即更新投影，避免只更新最后一个用户
    if v_user_granted_count > 0 then
      perform set_config('dydata.exemption_write_authorized', '1', true);
      update public.profiles
      set
        status = 'active',  -- 单日豁免不改为 exempt，只标记 exempt_type
        exempt_type = 'temporary',
        exempt_start_date = (select min(start_date) from public.exemption_grant where user_id = v_user_id and status = 'active'),
        exempt_end_date = (select max(end_date) from public.exemption_grant where user_id = v_user_id and status = 'active'),
        exempt_reason = p_reason,
        exemption_category = 'waive'
      where id = v_user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'granted_count', v_granted_count,
    'skipped_count', v_skipped_count,
    'total_requested', array_length(p_user_ids, 1) * array_length(p_dates, 1)
  );
end;
$$;

-- 仅 service_role 可调用（与 createAdminClient 权限对齐）
revoke all on function public.admin_grant_exemption_for_dates(uuid[], date[], text, text) from public, anon, authenticated;
grant execute on function public.admin_grant_exemption_for_dates(uuid[], date[], text, text) to service_role;

comment on function public.admin_grant_exemption_for_dates is 'H1修复：管理员手工豁免统一入口，使用正确列名且触发投影重算';
