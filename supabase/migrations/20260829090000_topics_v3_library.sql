-- Topics V3 施工包 A：选题库数据底座
-- 选题来源（内部自动沉淀 / 外部管理员导入）、入库状态、时长、外部成绩、来源视频去重。
-- 只新增列与表，不修改既有列；管理员移出只标记，不删除任何业务数据。

alter table public.sub_topics
  add column if not exists source_type text not null default 'internal'
    constraint sub_topics_source_type_check check (source_type in ('internal', 'external')),
  add column if not exists library_status text not null default 'in_library'
    constraint sub_topics_library_status_check check (library_status in ('in_library', 'removed')),
  add column if not exists duration_seconds integer
    constraint sub_topics_duration_seconds_check check (duration_seconds is null or duration_seconds >= 0),
  add column if not exists outline text,
  add column if not exists source_video_id uuid references public.videos(id) on delete set null,
  add column if not exists external_play_count bigint,
  add column if not exists external_like_count bigint,
  add column if not exists external_sample_count integer,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null,
  add column if not exists import_batch_id uuid;

-- 自动沉淀的内部选题：一个来源视频最多生成一个选题（幂等去重的数据库兜底）
create unique index if not exists sub_topics_one_internal_per_source_video
  on public.sub_topics (source_video_id)
  where source_type = 'internal' and source_video_id is not null;

-- 外部导入去重：同一母题下规范化标题唯一（大小写与首尾空白不敏感）
create unique index if not exists sub_topics_external_title_dedupe
  on public.sub_topics (topic_id, lower(btrim(title)))
  where source_type = 'external';

create index if not exists idx_sub_topics_library_status
  on public.sub_topics (library_status, topic_id, created_at desc);
create index if not exists idx_sub_topics_source_video
  on public.sub_topics (source_video_id)
  where source_video_id is not null;

-- 内部自动沉淀允许在无法可靠判断母题时留空（宁可不分类，不猜测归类）
alter table public.sub_topics alter column topic_id drop not null;

-- 外部导入批次记录（审计用）
create table if not exists public.topic_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  file_name text,
  total_rows integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_topic_import_batches_created
  on public.topic_import_batches (created_at desc);

alter table public.topic_import_batches enable row level security;

drop policy if exists "管理员读取导入批次" on public.topic_import_batches;
create policy "管理员读取导入批次"
  on public.topic_import_batches
  for select
  using (public.is_admin());

drop policy if exists "管理员写入导入批次" on public.topic_import_batches;
create policy "管理员写入导入批次"
  on public.topic_import_batches
  for insert
  with check (public.is_admin());

grant select, insert on public.topic_import_batches to authenticated;
grant select, insert on public.topic_import_batches to service_role;

-- 收紧成员直读：已移出选题对普通成员不可见（创建者本人与管理员仍可读）
drop policy if exists "已登录用户读取子题" on public.sub_topics;
create policy "已登录用户读取子题"
  on public.sub_topics
  for select
  using (
    auth.uid() is not null
    and (
      library_status = 'in_library'
      or created_by = auth.uid()
      or public.is_admin()
    )
  );
