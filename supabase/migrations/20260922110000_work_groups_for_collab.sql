-- 岗位管理「按团队」：工种小队编制（work_groups）+ 成员归属两列。
-- 只做岗位分组展示与编制，不参与权限、公司模型与数据范围；读写全部走服务端 service role。
-- 执行顺序纪律：应用代码具备部署条件后才执行本 migration。

create table if not exists public.work_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint work_groups_kind_check check (kind in ('writer', 'talent', 'operator')),
  constraint work_groups_team_id_name_key unique (team_id, name)
);

create index if not exists work_groups_team_id_idx on public.work_groups (team_id);

alter table public.profiles
  add column if not exists work_peer_group_id uuid,
  add column if not exists work_operator_group_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_work_peer_group_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_work_peer_group_id_fkey
      foreign key (work_peer_group_id)
      references public.work_groups (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_work_operator_group_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_work_operator_group_id_fkey
      foreign key (work_operator_group_id)
      references public.work_groups (id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_work_peer_group_id_idx on public.profiles (work_peer_group_id);
create index if not exists profiles_work_operator_group_id_idx on public.profiles (work_operator_group_id);

-- 与 writer_certifications 同一信任模型：启用行级安全且不开放任何直连通道，
-- 读写一律经服务端接口（service role）+ 应用层 manage_members/限本公司门禁。
alter table public.work_groups enable row level security;

revoke all on table public.work_groups from public, anon, authenticated;
grant select, insert, update, delete on table public.work_groups to service_role;

comment on table public.work_groups is
  '岗位管理「按团队」的工种小队编制；仅用于分组展示与编制，不参与权限与数据范围。';
comment on column public.work_groups.team_id is
  '所属一部/二部（public.teams）；建组与分配均限制在操作人本公司。';
comment on column public.work_groups.name is
  '小队名称；同一 team_id 内唯一。';
comment on column public.work_groups.kind is
  '工种：writer=文案，talent=达人，operator=运营。';
comment on column public.work_groups.created_by is
  '最近一次创建小队的操作人，便于审计追溯。';
comment on column public.profiles.work_peer_group_id is
  '文案/达人小队归属；文案与达人互斥，同一成员至多一个小队。';
comment on column public.profiles.work_operator_group_id is
  '运营小队归属；可与文案/达人小队并存，至多一个。';
