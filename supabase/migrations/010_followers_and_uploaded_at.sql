alter table public.daily_reports
  add column if not exists follower_gain integer not null default 0,
  add column if not exists follower_convert integer,
  add column if not exists uploaded_at timestamptz not null default timezone('utc'::text, now());
