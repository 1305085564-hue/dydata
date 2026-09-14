alter table public.videos
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

update public.videos
set review_status = 'pending'
where review_status is null;

alter table public.videos
  alter column review_status set default 'pending',
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.videos'::regclass
      and conname = 'videos_review_status_check'
  ) then
    alter table public.videos
      add constraint videos_review_status_check
      check (review_status in ('pending', 'reviewed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.videos'::regclass
      and conname = 'videos_reviewed_by_fkey'
  ) then
    alter table public.videos
      add constraint videos_reviewed_by_fkey
      foreign key (reviewed_by)
      references public.profiles(id)
      on delete set null;
  end if;
end $$;

comment on column public.videos.review_status is
  '内容复盘状态：pending=待复盘，reviewed=已复盘。';
comment on column public.videos.reviewed_at is
  '最近一次完成内容复盘的时间；撤销复盘时清空。';
comment on column public.videos.reviewed_by is
  '最近一次完成内容复盘的管理者；撤销复盘时清空。';
