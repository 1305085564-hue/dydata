alter table public.daily_reports
  add column if not exists submit_source text not null default 'manual',
  add column if not exists review_status text not null default 'pending',
  add column if not exists admin_note text,
  add column if not exists handler_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists team_id_snapshot uuid references public.teams(id) on delete set null,
  add column if not exists group_id_snapshot uuid references public.groups(id) on delete set null,
  add column if not exists edit_reason text,
  add column if not exists is_void boolean not null default false,
  add column if not exists private_message_count integer not null default 0,
  add column if not exists lead_count integer not null default 0,
  add column if not exists deal_count integer not null default 0,
  add column if not exists deal_amount numeric(12,2),
  add column if not exists data_quality_status text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_reports_submit_source_check'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_submit_source_check
      check (submit_source in ('manual', 'screenshot_ocr', 'admin_entry'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'daily_reports_review_status_check'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_review_status_check
      check (review_status in ('pending', 'confirmed', 'needs_changes', 'void'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'daily_reports_data_quality_status_check'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_data_quality_status_check
      check (data_quality_status in ('normal', 'screenshot_missing', 'ocr_pending', 'manual_corrected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'daily_reports_conversion_counts_nonnegative_check'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_conversion_counts_nonnegative_check
      check (
        private_message_count >= 0
        and lead_count >= 0
        and deal_count >= 0
        and (deal_amount is null or deal_amount >= 0)
      );
  end if;
end $$;

update public.daily_reports dr
set
  team_id_snapshot = coalesce(dr.team_id_snapshot, p.team_id),
  group_id_snapshot = coalesce(dr.group_id_snapshot, p.group_id)
from public.profiles p
where dr.user_id = p.id
  and (dr.team_id_snapshot is null or dr.group_id_snapshot is null);

create index if not exists idx_daily_reports_review_status
  on public.daily_reports(review_status);

create index if not exists idx_daily_reports_submit_source
  on public.daily_reports(submit_source);

create index if not exists idx_daily_reports_handler_user_id
  on public.daily_reports(handler_user_id);

create index if not exists idx_daily_reports_team_group_snapshot
  on public.daily_reports(team_id_snapshot, group_id_snapshot);

create index if not exists idx_daily_reports_is_void
  on public.daily_reports(is_void);
