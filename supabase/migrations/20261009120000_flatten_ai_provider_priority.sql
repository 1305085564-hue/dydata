-- 将供应商隐形权重摊平到渠道优先级。
-- 迁移在同一事务内保存原值，并逐模型逐位次断言排序不变；断言失败会整体回滚。
begin;

create table if not exists public.ai_provider_priority_migration_backup_20261009 (
  provider_id uuid primary key,
  provider_priority integer not null,
  captured_at timestamptz not null default now()
);

truncate public.ai_provider_priority_migration_backup_20261009;
insert into public.ai_provider_priority_migration_backup_20261009 (provider_id, provider_priority)
select id, priority from public.ai_providers;

create temp table _ai_priority_before on commit drop as
select m.model_id, m.key_id,
       row_number() over (partition by m.model_id order by k.priority + p.priority asc, k.id asc) as position
from public.ai_provider_key_models m
join public.ai_provider_keys k on k.id = m.key_id
join public.ai_providers p on p.id = k.provider_id;

update public.ai_provider_keys k
set priority = k.priority + p.priority,
    updated_at = now()
from public.ai_providers p
where p.id = k.provider_id;

update public.ai_providers
set priority = 0,
    updated_at = now();

create temp table _ai_priority_after on commit drop as
select m.model_id, m.key_id,
       row_number() over (partition by m.model_id order by k.priority + p.priority asc, k.id asc) as position
from public.ai_provider_key_models m
join public.ai_provider_keys k on k.id = m.key_id
join public.ai_providers p on p.id = k.provider_id;

do $$
begin
  if exists (
    (select model_id, key_id, position from _ai_priority_before
     except
     select model_id, key_id, position from _ai_priority_after)
    union all
    (select model_id, key_id, position from _ai_priority_after
     except
     select model_id, key_id, position from _ai_priority_before)
  ) then
    raise exception 'AI provider priority migration changed candidate ordering';
  end if;
end $$;

commit;
