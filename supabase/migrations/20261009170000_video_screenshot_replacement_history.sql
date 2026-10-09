-- 20261009170000: 新增截图替换留痕表。
-- 只新增表与索引，不修改、不删除任何现有表结构或历史数据。
-- 用途：成员换新截图时记一笔「什么时候换的、旧图是哪张、新图是哪张」。
-- 旧图数字一律作废，留痕仅作核对凭据，不参与任何计薪与复盘取数。

create table if not exists public.video_screenshot_replacement_history (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  user_id uuid not null references public.profiles(id),
  replaced_by uuid not null references public.profiles(id),
  -- 截图身份用角色记，不靠数组位置：screenshot_urls 只装「谁有图存谁」，
  -- 互动截图缺失时完播那张会落在第 0 位，按位置对号会把留痕记成串图。
  role text not null check (role in ('screenshot_1', 'screenshot_2')),
  replaced_at timestamptz not null,
  old_url text not null,
  new_url text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.video_screenshot_replacement_history is
  '截图替换留痕：每次换图记一笔。旧图仅作核对凭据，不参与计薪与复盘取数。';
comment on column public.video_screenshot_replacement_history.role is
  '被替换的截图身份：screenshot_1=互动数据，screenshot_2=完播留存';
comment on column public.video_screenshot_replacement_history.replaced_at is
  '替换发生时间，由服务端统一写入，不用客户端时间';

create index if not exists idx_video_screenshot_replacement_history_video
  on public.video_screenshot_replacement_history(video_id, replaced_at desc);

create index if not exists idx_video_screenshot_replacement_history_account
  on public.video_screenshot_replacement_history(account_id, replaced_at desc);

alter table public.video_screenshot_replacement_history enable row level security;

-- 成员可查自己账号下的留痕；管理端读取走 service role，不受 RLS 限制。
drop policy if exists video_screenshot_replacement_history_select_own
  on public.video_screenshot_replacement_history;
create policy video_screenshot_replacement_history_select_own
  on public.video_screenshot_replacement_history
  for select
  using (user_id = auth.uid());
