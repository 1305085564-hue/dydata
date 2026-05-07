-- Fix is_admin() to also recognize 'owner' role
-- Previously only checked for 'admin', causing owners to be blocked by RLS
-- on profiles_select_own_or_admin and other admin-only policies.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'owner')
  );
$$;
