do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_insight_result'::regclass
      and conname = 'ai_insight_result_insight_type_check'
  ) then
    alter table public.ai_insight_result
      drop constraint ai_insight_result_insight_type_check;
  end if;
end $$;

alter table public.ai_insight_result
  add constraint ai_insight_result_insight_type_check
  check (insight_type in ('growth_edit', 'period_direction', 'next_day_review', 'content_analysis'));

insert into public.ai_feature_config (feature_key, label)
values ('content_analysis', '内容内部分析')
on conflict (feature_key) do nothing;

create table if not exists public.content_observations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  observer_id uuid not null references public.profiles(id),
  traffic_peak_level text check (traffic_peak_level in ('high', 'medium', 'low', 'unset')),
  post_peak_trend text check (post_peak_trend in ('smooth_decline', 'cliff_drop', 'multiple_peaks', 'unset')),
  traffic_retention_quality text check (traffic_retention_quality in ('good', 'average', 'poor', 'unset')),
  drop_off_stage text check (drop_off_stage in ('opening', 'middle', 'ending', 'not_obvious', 'unset')),
  suspected_problem_stage text check (suspected_problem_stage in ('opening', 'middle_content', 'topic_mismatch', 'weak_interaction', 'weak_conversion', 'unset')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, observer_id)
);

create index if not exists idx_content_observations_video_id
  on public.content_observations(video_id);

create index if not exists idx_content_observations_observer_id
  on public.content_observations(observer_id);

grant select, insert, update, delete on public.content_observations to authenticated;
grant select, insert, update, delete on public.content_observations to service_role;

alter table public.content_observations enable row level security;

drop policy if exists "管理员读取内容观察" on public.content_observations;
create policy "管理员读取内容观察"
  on public.content_observations
  for select
  using (public.is_admin());

drop policy if exists "管理员管理内容观察" on public.content_observations;
create policy "管理员管理内容观察"
  on public.content_observations
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_content_observations_updated_at on public.content_observations;
create trigger trg_content_observations_updated_at
before update on public.content_observations
for each row execute function public.touch_updated_at();

create table if not exists public.content_experience_marks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  feedback_card_id uuid references public.content_feedback_cards(id) on delete set null,
  ai_insight_result_id uuid references public.ai_insight_result(id) on delete set null,
  experience_type text not null check (experience_type in (
    'hot_case',
    'fail_case',
    'opening_issue',
    'middle_issue',
    'retention_issue',
    'conversion_issue'
  )),
  note text,
  marked_by uuid not null references public.profiles(id),
  visibility_scope text not null default 'team' check (visibility_scope in ('team', 'company')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, marked_by)
);

create index if not exists idx_content_experience_marks_video_id
  on public.content_experience_marks(video_id, updated_at desc);

create index if not exists idx_content_experience_marks_marked_by
  on public.content_experience_marks(marked_by, updated_at desc);

create index if not exists idx_content_experience_marks_feedback_card_id
  on public.content_experience_marks(feedback_card_id);

create index if not exists idx_content_experience_marks_ai_insight_result_id
  on public.content_experience_marks(ai_insight_result_id);

create index if not exists idx_content_experience_marks_type_created
  on public.content_experience_marks(experience_type, created_at desc);

grant select, insert, update, delete on public.content_experience_marks to authenticated;
grant select, insert, update, delete on public.content_experience_marks to service_role;

alter table public.content_experience_marks enable row level security;

drop policy if exists "管理员读取经验标记" on public.content_experience_marks;
create policy "管理员读取经验标记"
  on public.content_experience_marks
  for select
  using (public.is_admin());

drop policy if exists "管理员管理经验标记" on public.content_experience_marks;
create policy "管理员管理经验标记"
  on public.content_experience_marks
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_content_experience_marks_updated_at on public.content_experience_marks;
create trigger trg_content_experience_marks_updated_at
before update on public.content_experience_marks
for each row execute function public.touch_updated_at();
