-- Reconcile the missing abnormal-video source fields and restricted case RLS.

alter table public.violation_cases
  add column if not exists source_video_id uuid references public.videos(id) on delete set null,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists highlighted_sections jsonb not null default '[]'::jsonb;

create unique index if not exists idx_violation_cases_source_video_id_unique
  on public.violation_cases (source_video_id)
  where source_video_id is not null;

comment on column public.violation_cases.source_video_id
  is '异常案例关联的原始视频；同一视频最多生成一条案例';
comment on column public.violation_cases.source_metadata
  is '异常视频提交来源上下文：平台通知、处罚类型、申诉、视频标题和链接';
comment on column public.violation_cases.highlighted_sections
  is '管理员标注的违规段落：start/end/text/reason/created_at 数组';

drop policy if exists "vc_select" on public.violation_cases;
create policy "vc_select" on public.violation_cases
  for select
  using (
    auth.role() = 'authenticated'
    and is_deleted = false
    and (status = 'verified' or public.has_violation_permission())
  );

drop policy if exists "vc_insert" on public.violation_cases;
create policy "vc_insert" on public.violation_cases
  for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = submitted_by
    and status = 'submitted'
    and is_deleted = false
    and reviewed_by is null
    and reviewed_at is null
    and highlighted_sections = '[]'::jsonb
    and (account_id is null or public.owns_account(account_id))
    and (
      source_video_id is null
      or exists (
        select 1 from public.videos v
        where v.id = source_video_id
          and v.user_id = auth.uid()
          and v.account_id = violation_cases.account_id
      )
    )
  );
