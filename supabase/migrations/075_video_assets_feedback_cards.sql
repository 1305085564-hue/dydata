alter table public.videos
  add column if not exists asset_level text
    check (asset_level in ('S', 'A', 'B', 'C')),
  add column if not exists asset_note text,
  add column if not exists asset_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists asset_reviewed_at timestamptz;

create index if not exists idx_videos_asset_level
  on public.videos(asset_level);

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
  check (insight_type in ('growth_edit', 'period_direction', 'next_day_review'));

create table if not exists public.content_feedback_cards (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  target_account_id uuid references public.accounts(id) on delete set null,
  source_result_id uuid references public.ai_insight_result(id) on delete set null,
  card_status text not null default 'draft'
    check (card_status in ('draft', 'confirmed', 'sent', 'viewed')),
  manager_note text,
  draft_payload jsonb,
  confirmed_payload jsonb,
  draft_generated_at timestamptz default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id)
);

create index if not exists idx_content_feedback_cards_target_user_id
  on public.content_feedback_cards(target_user_id, card_status, sent_at desc nulls last);

create index if not exists idx_content_feedback_cards_source_result_id
  on public.content_feedback_cards(source_result_id);

grant select, insert, update, delete on public.content_feedback_cards to authenticated;
grant select, insert, update, delete on public.content_feedback_cards to service_role;

alter table public.content_feedback_cards enable row level security;

drop policy if exists "员工读取已下发反馈卡" on public.content_feedback_cards;
create policy "员工读取已下发反馈卡"
  on public.content_feedback_cards
  for select
  using (
    target_user_id = auth.uid()
    and card_status in ('sent', 'viewed')
  );

drop policy if exists "管理员读取反馈卡" on public.content_feedback_cards;
create policy "管理员读取反馈卡"
  on public.content_feedback_cards
  for select
  using (public.is_admin());

drop policy if exists "管理员管理反馈卡" on public.content_feedback_cards;
create policy "管理员管理反馈卡"
  on public.content_feedback_cards
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_content_feedback_cards_updated_at on public.content_feedback_cards;
create trigger trg_content_feedback_cards_updated_at
before update on public.content_feedback_cards
for each row execute function public.touch_updated_at();
