-- Owner scope is always all, even when legacy data_scope values are stale.

create or replace function public.get_data_scope()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'owner' then 'all'
    else coalesce((select data_scope from public.profiles where id = auth.uid()), 'self')
  end;
$$;

create or replace function public.visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_scope text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if p_actor_id is null then
    return;
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    return;
  end if;

  v_scope := case
    when v_actor.role = 'owner' then 'all'
    else coalesce(v_actor.data_scope, 'self')
  end;

  if v_scope = 'all' then
    return query select p.id from public.profiles p;
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query select p.id from public.profiles p where p.team_id = v_actor.team_id;
    return;
  end if;

  return query select v_actor.id;
end;
$$;

create or replace function public.active_visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_scope text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if p_actor_id is null then
    return;
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_scope := case
    when v_actor.role = 'owner' then 'all'
    else coalesce(v_actor.data_scope, 'self')
  end;

  if v_scope = 'all' then
    return query
    select p.id
    from public.profiles p
    where coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query
    select p.id
    from public.profiles p
    where p.team_id = v_actor.team_id
      and coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  return query select v_actor.id;
end;
$$;

grant execute on function public.get_data_scope() to authenticated, service_role;
grant execute on function public.visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.active_visible_user_ids(uuid) to authenticated, service_role;
