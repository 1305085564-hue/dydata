-- Topics V3 施工包 B1：废除排他认领，改为多人同时写作
-- 状态机：writing（正在写）/ cancelled（手动取消）/ completed（提交关联作品后结束）。
-- 旧状态值保留在 check 约束中仅用于历史兼容，应用层只写新值；不删除任何历史业务记录。

-- 1. 先移除旧 status check 约束（约束名为自动生成，按定义动态查找）
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.sub_topic_claims'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%candidate%';
  if constraint_name is not null then
    execute format('alter table public.sub_topic_claims drop constraint %I', constraint_name);
  end if;
end $$;

-- 2. 历史数据语义迁移：candidate/scripting 都视为「正在写」，returned 视为「已取消」
update public.sub_topic_claims set status = 'writing' where status in ('candidate', 'scripting');
update public.sub_topic_claims set status = 'cancelled' where status = 'returned';

-- 3. 新约束：应用层只允许新状态；旧值仅作为历史兼容保留
alter table public.sub_topic_claims add constraint sub_topic_claims_status_check
  check (status in ('candidate', 'scripting', 'returned', 'writing', 'cancelled', 'completed'));

-- 4. 结束信息：手动取消或提交作品时写入；completed 记录关联作品
alter table public.sub_topic_claims
  add column if not exists ended_at timestamptz,
  add column if not exists completed_video_id uuid references public.videos(id) on delete set null;

-- 5. 一人一题只能有一个有效写作状态（writing）；取消后可重新开始（新建一行）
drop index if exists sub_topic_claims_one_active_per_user_topic;
create unique index if not exists sub_topic_claims_one_writing_per_user_topic
  on public.sub_topic_claims (user_id, sub_topic_id)
  where status = 'writing';

-- 6. 废除每人 5 条候选上限（触发器 + 函数一并删除）
drop trigger if exists trg_sub_topic_claims_candidate_limit on public.sub_topic_claims;
drop function if exists public.enforce_candidate_claim_limit();

-- 7. 七天热度：在写统计索引
create index if not exists idx_sub_topic_claims_writing_claimed
  on public.sub_topic_claims (sub_topic_id, claimed_at desc)
  where status = 'writing';
