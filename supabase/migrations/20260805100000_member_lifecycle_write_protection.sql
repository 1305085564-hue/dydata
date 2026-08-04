-- Member lifecycle write protection.
-- Keep this migration independent from the lifecycle column migration so the
-- permissions can be re-applied when the earlier remote history is incomplete.

revoke update, insert on table public.profiles from authenticated;
grant update (name) on table public.profiles to authenticated;

revoke update (
  membership_status,
  archived_at,
  archived_by,
  archive_reason,
  archive_snapshot
) on table public.profiles from authenticated;

create or replace function public.guard_profile_membership_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if (
    new.membership_status is distinct from old.membership_status
    or new.archived_at is distinct from old.archived_at
    or new.archived_by is distinct from old.archived_by
    or new.archive_reason is distinct from old.archive_reason
    or new.archive_snapshot is distinct from old.archive_snapshot
  )
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = '成员生命周期字段只能通过受控生命周期流程修改';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_membership_lifecycle on public.profiles;
create trigger guard_profile_membership_lifecycle
before update of membership_status, archived_at, archived_by, archive_reason, archive_snapshot
on public.profiles
for each row
execute function public.guard_profile_membership_lifecycle();

revoke all on function public.guard_profile_membership_lifecycle() from public, anon, authenticated;
