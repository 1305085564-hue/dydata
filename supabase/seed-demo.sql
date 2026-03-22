-- 演示团队种子数据
-- 依赖：public.teams 已存在演示团队，public.profiles.id 引用 auth.users.id

begin;

create extension if not exists pgcrypto;

with demo_team as (
  select id
  from public.teams
  where is_demo = true
  order by created_at asc
  limit 1
),
demo_auth_users as (
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    format('demo+%s@dydata.local', code),
    crypt('dydata-demo-123456', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', display_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  from (
    values
      ('a', '员工A'),
      ('b', '员工B'),
      ('c', '员工C'),
      ('d', '员工D'),
      ('e', '员工E'),
      ('f', '员工F'),
      ('g', '员工G'),
      ('h', '员工H'),
      ('i', '员工I'),
      ('j', '员工J')
  ) as seed(code, display_name)
  where not exists (
    select 1 from auth.users where email = format('demo+%s@dydata.local', code)
  )
  returning id, email, raw_user_meta_data
),
all_demo_users as (
  select id, email, raw_user_meta_data
  from auth.users
  where email in (
    'demo+a@dydata.local',
    'demo+b@dydata.local',
    'demo+c@dydata.local',
    'demo+d@dydata.local',
    'demo+e@dydata.local',
    'demo+f@dydata.local',
    'demo+g@dydata.local',
    'demo+h@dydata.local',
    'demo+i@dydata.local',
    'demo+j@dydata.local'
  )
),
upsert_profiles as (
  insert into public.profiles (id, name, role, team_id, permissions)
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
    'member',
    demo_team.id,
    '{}'::jsonb
  from all_demo_users u
  cross join demo_team
  on conflict (id) do update
    set name = excluded.name,
        role = 'member',
        team_id = excluded.team_id
  returning id, name
),
upsert_accounts as (
  insert into public.accounts (profile_id, name, content_direction, presentation_format)
  select id, name, '演示数据', '口播'
  from upsert_profiles
  on conflict (profile_id, name) do update
    set content_direction = excluded.content_direction,
        presentation_format = excluded.presentation_format
  returning id, profile_id, name
),
days as (
  select generate_series(current_date - interval '29 day', current_date, interval '1 day')::date as report_date
),
seed_reports as (
  select
    gen_random_uuid() as id,
    a.profile_id as user_id,
    a.id as account_id,
    d.report_date,
    format('%s 数据分析演示 %s', a.name, to_char(d.report_date, 'MMDD')) as title,
    a.name as submitter,
    floor(5000 + random() * 45000)::int as play_count,
    round((0.2 + random() * 0.4)::numeric, 3) as completion_rate_numeric,
    floor(18 + random() * 42)::int as avg_play_seconds,
    round((0.12 + random() * 0.18)::numeric, 3) as bounce_rate_numeric,
    round((0.18 + random() * 0.22)::numeric, 3) as completion_rate_5s_numeric,
    d.report_date::timestamp + ((8 + floor(random() * 12))::text || ' hours')::interval as published_at,
    now() - ((floor(random() * 20))::text || ' minutes')::interval as uploaded_at
  from upsert_accounts a
  cross join days d
),
final_reports as (
  select
    id,
    user_id,
    account_id,
    report_date,
    title,
    submitter,
    play_count,
    to_char(completion_rate_numeric * 100, 'FM90D0') || '%' as completion_rate,
    avg_play_seconds::text || '秒' as avg_play_duration,
    to_char(bounce_rate_numeric * 100, 'FM90D0') || '%' as bounce_rate_2s,
    to_char(completion_rate_5s_numeric * 100, 'FM90D0') || '%' as completion_rate_5s,
    greatest(floor(play_count * (0.025 + random() * 0.03))::int, 120) as likes,
    greatest(floor(play_count * (0.0015 + random() * 0.003))::int, 12) as comments,
    greatest(floor(play_count * (0.001 + random() * 0.002))::int, 8) as shares,
    greatest(floor(play_count * (0.0012 + random() * 0.0025))::int, 10) as favorites,
    greatest(floor(play_count * (0.0008 + random() * 0.0015))::int, 5) as follower_gain,
    round((0.015 + random() * 0.05)::numeric, 3) as follower_convert,
    format('%s 在 %s 的演示日报内容，用于权限与团队数据展示。', submitter, to_char(report_date, 'MM-DD')) as content,
    published_at,
    uploaded_at
  from seed_reports
)
insert into public.daily_reports (
  id,
  user_id,
  account_id,
  report_date,
  title,
  submitter,
  play_count,
  completion_rate,
  avg_play_duration,
  bounce_rate_2s,
  completion_rate_5s,
  likes,
  comments,
  shares,
  favorites,
  follower_gain,
  follower_convert,
  content,
  published_at,
  uploaded_at
)
select
  id,
  user_id,
  account_id,
  report_date,
  title,
  submitter,
  play_count,
  completion_rate,
  avg_play_duration,
  bounce_rate_2s,
  completion_rate_5s,
  likes,
  comments,
  shares,
  favorites,
  follower_gain,
  follower_convert,
  content,
  published_at,
  uploaded_at
from final_reports
on conflict (account_id, report_date) do update
set title = excluded.title,
    submitter = excluded.submitter,
    play_count = excluded.play_count,
    completion_rate = excluded.completion_rate,
    avg_play_duration = excluded.avg_play_duration,
    bounce_rate_2s = excluded.bounce_rate_2s,
    completion_rate_5s = excluded.completion_rate_5s,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    favorites = excluded.favorites,
    follower_gain = excluded.follower_gain,
    follower_convert = excluded.follower_convert,
    content = excluded.content,
    published_at = excluded.published_at,
    uploaded_at = excluded.uploaded_at;

commit;
