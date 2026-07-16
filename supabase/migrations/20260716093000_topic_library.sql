create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int,
  created_at timestamptz not null default now()
);

create unique index if not exists topics_name_key on public.topics(name);
create index if not exists idx_topics_sort_order on public.topics(sort_order nulls last, name);

create table if not exists public.topic_groups (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz not null default now()
);

create unique index if not exists topic_groups_topic_id_name_key on public.topic_groups(topic_id, name);
create index if not exists idx_topic_groups_topic_sort on public.topic_groups(topic_id, sort_order nulls last, name);

create table if not exists public.sub_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  hook text not null,
  topic_id uuid not null references public.topics(id) on delete restrict,
  group_id uuid references public.topic_groups(id) on delete set null,
  emotion_tag text,
  source text,
  audience text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_sub_topics_topic_group on public.sub_topics(topic_id, group_id, created_at desc);
create index if not exists idx_sub_topics_created_by on public.sub_topics(created_by, created_at desc);

create table if not exists public.sub_topic_claims (
  id uuid primary key default gen_random_uuid(),
  sub_topic_id uuid not null references public.sub_topics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('candidate', 'scripting', 'returned')),
  claimed_at timestamptz not null default now(),
  returned_at timestamptz
);

create index if not exists idx_sub_topic_claims_user_status on public.sub_topic_claims(user_id, status, claimed_at desc);
create index if not exists idx_sub_topic_claims_sub_topic on public.sub_topic_claims(sub_topic_id, status, claimed_at desc);
create unique index if not exists sub_topic_claims_one_active_per_user_topic
  on public.sub_topic_claims(user_id, sub_topic_id)
  where status in ('candidate', 'scripting');

alter table public.videos
  add column if not exists topic_id uuid references public.sub_topics(id) on delete set null;

create index if not exists idx_videos_topic_id on public.videos(topic_id, uploaded_at desc);

create or replace function public.enforce_candidate_claim_limit()
returns trigger
language plpgsql
as $$
declare
  candidate_count int;
begin
  if new.status <> 'candidate' then
    return new;
  end if;

  select count(*)
  into candidate_count
  from public.sub_topic_claims
  where user_id = new.user_id
    and status = 'candidate'
    and id is distinct from new.id;

  if candidate_count >= 5 then
    raise exception 'candidate topic limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sub_topic_claims_candidate_limit on public.sub_topic_claims;
create trigger trg_sub_topic_claims_candidate_limit
before insert or update of status, user_id
on public.sub_topic_claims
for each row execute function public.enforce_candidate_claim_limit();

grant select on public.topics, public.topic_groups, public.sub_topics to authenticated;
grant insert, update, delete on public.sub_topics to authenticated;
grant select, insert, update, delete on public.sub_topic_claims to authenticated;
grant select, insert, update, delete on public.topics, public.topic_groups, public.sub_topics, public.sub_topic_claims to service_role;

alter table public.topics enable row level security;
alter table public.topic_groups enable row level security;
alter table public.sub_topics enable row level security;
alter table public.sub_topic_claims enable row level security;

drop policy if exists "已登录用户读取母题" on public.topics;
create policy "已登录用户读取母题"
  on public.topics
  for select
  using (auth.uid() is not null);

drop policy if exists "管理员管理母题" on public.topics;
create policy "管理员管理母题"
  on public.topics
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "已登录用户读取选题分组" on public.topic_groups;
create policy "已登录用户读取选题分组"
  on public.topic_groups
  for select
  using (auth.uid() is not null);

drop policy if exists "管理员管理选题分组" on public.topic_groups;
create policy "管理员管理选题分组"
  on public.topic_groups
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "已登录用户读取子题" on public.sub_topics;
create policy "已登录用户读取子题"
  on public.sub_topics
  for select
  using (auth.uid() is not null);

drop policy if exists "已登录用户创建自己的子题" on public.sub_topics;
create policy "已登录用户创建自己的子题"
  on public.sub_topics
  for insert
  with check (created_by = auth.uid());

drop policy if exists "创建者或管理员更新子题" on public.sub_topics;
create policy "创建者或管理员更新子题"
  on public.sub_topics
  for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "创建者或管理员删除子题" on public.sub_topics;
create policy "创建者或管理员删除子题"
  on public.sub_topics
  for delete
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "用户读取自己的认领" on public.sub_topic_claims;
create policy "用户读取自己的认领"
  on public.sub_topic_claims
  for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "用户创建自己的认领" on public.sub_topic_claims;
create policy "用户创建自己的认领"
  on public.sub_topic_claims
  for insert
  with check (user_id = auth.uid());

drop policy if exists "用户更新自己的认领" on public.sub_topic_claims;
create policy "用户更新自己的认领"
  on public.sub_topic_claims
  for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "用户删除自己的认领" on public.sub_topic_claims;
create policy "用户删除自己的认领"
  on public.sub_topic_claims
  for delete
  using (user_id = auth.uid() or public.is_admin());

with seed_topics(name, sort_order) as (
  values
    ('暴力战法类', 10),
    ('热点/新闻解读类', 20),
    ('情绪周期类', 30),
    ('案例拆解/复盘类', 40),
    ('避坑防雷类', 50),
    ('降维认知类', 60),
    ('顶级心法类', 70),
    ('工具/神技类', 80)
)
insert into public.topics(name, sort_order)
select name, sort_order from seed_topics
on conflict (name) do update
set sort_order = excluded.sort_order;

with seed_groups(topic_name, group_name, sort_order) as (
  values
    ('暴力战法类', '图形战法', 10),
    ('暴力战法类', '分时盘口', 20),
    ('暴力战法类', '模式战法', 30),
    ('暴力战法类', '龙头选股', 40),
    ('暴力战法类', '打板连板', 50),
    ('暴力战法类', '止盈止损', 60),
    ('热点/新闻解读类', '公告选秀', 10),
    ('热点/新闻解读类', '突发推演', 20),
    ('热点/新闻解读类', '小作文鉴定', 30),
    ('热点/新闻解读类', '政策精读', 40),
    ('热点/新闻解读类', '热点二阶思维', 50),
    ('情绪周期类', '周期入门', 10),
    ('情绪周期类', '每日体温计', 20),
    ('情绪周期类', '各阶段打法', 30),
    ('情绪周期类', '主线轮动', 40),
    ('情绪周期类', '空仓艺术', 50),
    ('案例拆解/复盘类', '妖股成龙史', 10),
    ('案例拆解/复盘类', '单次战役', 20),
    ('案例拆解/复盘类', '实盘日记', 30),
    ('案例拆解/复盘类', '龙虎榜复盘', 40),
    ('案例拆解/复盘类', '历史行情', 50),
    ('避坑防雷类', '骗局黑产', 10),
    ('避坑防雷类', 'ST财务雷', 20),
    ('避坑防雷类', '制度规则坑', 30),
    ('避坑防雷类', '心态大坑', 40),
    ('降维认知类', '主力思维', 10),
    ('降维认知类', '资金生态', 20),
    ('降维认知类', '宏观翻译', 30),
    ('降维认知类', '产业逻辑', 40),
    ('降维认知类', '制度视角', 50),
    ('降维认知类', '揭秘类', 60),
    ('顶级心法类', '人性弱点', 10),
    ('顶级心法类', '知行合一', 20),
    ('顶级心法类', '交易孤独', 30),
    ('顶级心法类', '盈亏哲学', 40),
    ('工具/神技类', '看盘布局', 10),
    ('工具/神技类', '条件选股', 20),
    ('工具/神技类', '数据资讯源', 30),
    ('工具/神技类', '盘口预警', 40),
    ('工具/神技类', '复盘工具流', 50)
)
insert into public.topic_groups(topic_id, name, sort_order)
select topics.id, seed_groups.group_name, seed_groups.sort_order
from seed_groups
join public.topics on topics.name = seed_groups.topic_name
on conflict (topic_id, name) do update
set sort_order = excluded.sort_order;
