-- system_settings contains server-side configuration only.
-- Browser-authenticated clients must not read or mutate it directly; the
-- application routes keep the manage_system check before using service_role.

begin;

alter table public.system_settings enable row level security;

drop policy if exists "Admins manage system settings" on public.system_settings;
drop policy if exists "Service role full access on system_settings" on public.system_settings;

revoke all on table public.system_settings from anon, authenticated;
grant select, insert, update, delete on table public.system_settings to service_role;

create policy "Service role full access on system_settings"
  on public.system_settings
  for all
  to service_role
  using (true)
  with check (true);

commit;
