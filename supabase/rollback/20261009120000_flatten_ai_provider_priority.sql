-- 回滚 20261009120000_flatten_ai_provider_priority.sql。
-- 先确认备份表存在，再在一个事务中恢复供应商优先级并反推渠道优先级。
begin;

do $$
begin
  if to_regclass('public.ai_provider_priority_migration_backup_20261009') is null then
    raise exception 'priority migration backup is missing';
  end if;
end $$;

update public.ai_provider_keys k
set priority = k.priority - b.provider_priority,
    updated_at = now()
from public.ai_provider_priority_migration_backup_20261009 b
where b.provider_id = k.provider_id;

update public.ai_providers p
set priority = b.provider_priority,
    updated_at = now()
from public.ai_provider_priority_migration_backup_20261009 b
where b.provider_id = p.id;

commit;
