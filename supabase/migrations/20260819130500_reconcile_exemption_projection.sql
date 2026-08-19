-- Reconcile the missing one-grant-per-request constraint and profile guard.

create unique index if not exists exemption_grant_request_id_unique
  on public.exemption_grant (request_id)
  where request_id is not null;

create or replace function public.guard_profile_exemption_projection()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if (
    new.status is distinct from old.status
    or new.exempt_type is distinct from old.exempt_type
    or new.exempt_start_date is distinct from old.exempt_start_date
    or new.exempt_end_date is distinct from old.exempt_end_date
    or new.exempt_reason is distinct from old.exempt_reason
    or new.exemption_category is distinct from old.exemption_category
  )
    and coalesce(current_setting('dydata.exemption_write_authorized', true), '') <> '1'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = '豁免字段只能通过授权流程修改';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_exemption_projection on public.profiles;
create trigger guard_profile_exemption_projection
before update of status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category
on public.profiles
for each row
execute function public.guard_profile_exemption_projection();

revoke all on function public.guard_profile_exemption_projection() from public, anon, authenticated;
