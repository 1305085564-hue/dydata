-- 文案岗位认证与作品统计解耦：只保存当前认证状态和本次操作人的可展示署名。
create table if not exists public.writer_certifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  certified boolean not null default false,
  certified_by uuid not null references public.profiles(id) on delete restrict,
  certified_by_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.writer_certifications enable row level security;

-- 认证只能通过已经完成应用层身份、范围与在职状态校验的服务端接口读写。
revoke all on table public.writer_certifications from public, anon, authenticated;
grant select, insert, update, delete on table public.writer_certifications to service_role;

drop trigger if exists trg_writer_certifications_updated_at on public.writer_certifications;
create trigger trg_writer_certifications_updated_at
before update on public.writer_certifications
for each row execute function public.touch_updated_at();
