-- 默认团队初始化属于部署数据，不应由公开 GET /api/register-teams 触发写库。
insert into public.teams (name, is_demo)
select '深圳二部', false
where not exists (
  select 1 from public.teams where name = '深圳二部'
);
