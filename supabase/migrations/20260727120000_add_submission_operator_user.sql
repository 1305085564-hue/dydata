-- 日报和视频分别记录文案、剪辑、运营责任人，删除成员后保留记录并清空归属。
alter table public.daily_reports
  add column if not exists script_author_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists video_editor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists operator_user_id uuid references public.profiles(id) on delete set null;

alter table public.videos
  add column if not exists script_author_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists video_editor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists operator_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_daily_reports_script_author_user_id
  on public.daily_reports(script_author_user_id);

create index if not exists idx_daily_reports_video_editor_user_id
  on public.daily_reports(video_editor_user_id);

create index if not exists idx_daily_reports_operator_user_id
  on public.daily_reports(operator_user_id);

create index if not exists idx_videos_script_author_user_id
  on public.videos(script_author_user_id);

create index if not exists idx_videos_video_editor_user_id
  on public.videos(video_editor_user_id);

create index if not exists idx_videos_operator_user_id
  on public.videos(operator_user_id);
