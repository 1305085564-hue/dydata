-- AI 渠道治理：兼容旧应用字段；新应用须在本迁移生效后部署。
begin;

alter table public.ai_provider_keys
  add column if not exists first_failure_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists manual_sleep_until timestamptz;
alter table public.ai_provider_key_models
  add column if not exists first_failure_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists sort_order integer;

-- 历史数据没有首败时间，从最后一次已知失败开始计时，不猜测过去的窗口。
update public.ai_provider_keys set first_failure_at = last_failure_at
where first_failure_at is null and consecutive_failures > 0
  and (last_success_at is null or last_failure_at > last_success_at);
update public.ai_provider_key_models set first_failure_at = last_failure_at
where first_failure_at is null and consecutive_failures > 0
  and (last_success_at is null or last_failure_at > last_success_at);

create temp table _ai_channel_order_before on commit drop as
select m.id, m.model_id,
  row_number() over (partition by m.model_id order by k.priority + p.priority, k.id, m.id)::integer as position
from public.ai_provider_key_models m
join public.ai_provider_keys k on k.id = m.key_id
join public.ai_providers p on p.id = k.provider_id;
update public.ai_provider_key_models m set sort_order = previous.position
from _ai_channel_order_before previous where previous.id = m.id;
alter table public.ai_provider_key_models alter column sort_order set not null;
alter table public.ai_provider_key_models add constraint ai_provider_key_models_model_order_unique
  unique (model_id, sort_order) deferrable initially deferred;
do $$ begin
  if exists (select 1 from _ai_channel_order_before previous
    join public.ai_provider_key_models m on m.id = previous.id
    where m.sort_order <> previous.position) then
    raise exception 'AI channel order migration changed existing ordering';
  end if;
end $$;

create or replace function public.assign_ai_channel_sort_order()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
    from public.ai_provider_key_models where model_id = new.model_id;
  end if;
  return new;
end $$;
create trigger assign_ai_channel_sort_order before insert on public.ai_provider_key_models
for each row execute function public.assign_ai_channel_sort_order();

-- 旧应用成功记录只会写原字段，迁移窗口内也要正确结束连续失败周期。
create or replace function public.reset_ai_channel_failure_window_on_success()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.last_success_at is distinct from old.last_success_at
    and new.last_success_at is not null
    and (new.last_failure_at is null or new.last_success_at >= new.last_failure_at) then
    new.first_failure_at := null;
    new.invalidated_at := null;
  end if;
  return new;
end $$;
create trigger reset_ai_key_failure_window_on_success before update of last_success_at on public.ai_provider_keys
for each row execute function public.reset_ai_channel_failure_window_on_success();
create trigger reset_ai_model_failure_window_on_success before update of last_success_at on public.ai_provider_key_models
for each row execute function public.reset_ai_channel_failure_window_on_success();

-- 替换签名但保留原参数名和默认值，旧应用调用仍有效。
drop function if exists public.bump_provider_key_failure(uuid, text);
create or replace function public.bump_provider_key_failure(
  key_id uuid, error_message text default null, permanent_failure boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_provider_keys k set
    consecutive_failures = coalesce(k.consecutive_failures, 0) + 1,
    first_failure_at = coalesce(k.first_failure_at, now()),
    invalidated_at = case when permanent_failure or
      now() - coalesce(k.first_failure_at, now()) >= interval '24 hours'
      then coalesce(k.invalidated_at, now()) else k.invalidated_at end,
    unhealthy_until = case when coalesce(k.consecutive_failures, 0) + 1 >= 3 then
      now() + (array[5,15,30,60,120,240,360])[least(coalesce(k.consecutive_failures,0) - 1, 7)] * interval '1 minute'
      else k.unhealthy_until end,
    last_failure_at = now(), last_error_message = left(coalesce(error_message, ''), 500), updated_at = now()
  where k.id = key_id;
end $$;
revoke all on function public.bump_provider_key_failure(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.bump_provider_key_failure(uuid, text, boolean) to service_role;

drop function if exists public.bump_provider_key_model_failure(uuid, text, text);
create or replace function public.bump_provider_key_model_failure(
  key_model_id uuid, error_message text default null, failure_scope text default 'unknown',
  permanent_failure boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_provider_key_models m set
    consecutive_failures = coalesce(m.consecutive_failures, 0) + 1,
    first_failure_at = coalesce(m.first_failure_at, now()),
    invalidated_at = case when permanent_failure or
      now() - coalesce(m.first_failure_at, now()) >= interval '24 hours'
      then coalesce(m.invalidated_at, now()) else m.invalidated_at end,
    unhealthy_until = case when coalesce(m.consecutive_failures, 0) + 1 >= 3 then
      now() + (array[5,15,30,60,120,240,360])[least(coalesce(m.consecutive_failures,0) - 1, 7)] * interval '1 minute'
      else m.unhealthy_until end,
    last_failure_at = now(), last_error_message = left(coalesce(error_message, ''), 500),
    last_failure_scope = case when failure_scope in ('model','unknown') then failure_scope else 'unknown' end
  where m.id = key_model_id;
end $$;
revoke all on function public.bump_provider_key_model_failure(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bump_provider_key_model_failure(uuid, text, text, boolean) to service_role;

create or replace function public.swap_provider_key_model_order(
  p_model_id text, p_key_model_id uuid, p_target_key_model_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare current_order integer; target_order integer;
begin
  -- 同模型顺位在单事务内读取、校验与互换，不改其他模型或Key全局顺位。
  -- 「可调度相邻」校验由管理接口在调用前完成（SQL 内无法复用五态判断），此处只保证同模型与原子交换。
  perform id from public.ai_provider_key_models where model_id = p_model_id order by sort_order for update;
  select sort_order into current_order from public.ai_provider_key_models
    where id = p_key_model_id and model_id = p_model_id;
  select sort_order into target_order from public.ai_provider_key_models
    where id = p_target_key_model_id and model_id = p_model_id;
  if current_order is null or target_order is null or p_key_model_id = p_target_key_model_id then
    raise exception '渠道不存在或不属于同一模型';
  end if;
  update public.ai_provider_key_models set sort_order = case
    when id = p_key_model_id then target_order else current_order end
  where id in (p_key_model_id,p_target_key_model_id) and model_id = p_model_id;
end $$;
revoke all on function public.swap_provider_key_model_order(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.swap_provider_key_model_order(text, uuid, uuid) to service_role;

commit;
