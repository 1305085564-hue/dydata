-- Keep the permission predicate total: missing or inactive identities must
-- return false instead of SQL null so non-RLS callers receive the same result.

create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select perm = any(
        public.get_role_permissions(
          coalesce(
            p.company_role,
            case when p.role = 'owner' then 'company_owner' else p.role end
          ),
          false
        )
      )
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
    ),
    false
  );
$$;

comment on function public.has_permission(text) is
  'Checks active current-user fixed role permissions and returns false for missing or inactive identities.';

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated, service_role;
