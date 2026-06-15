-- 此刻：将旧展示名“一刻”统一迁移为“此刻”

alter table public.yike_workspaces
  alter column name set default '此刻';

update public.yike_workspaces
set name = '此刻'
where name = '一刻';
