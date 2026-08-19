begin;
CREATE OR REPLACE FUNCTION public.get_data_scope()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select data_scope from public.profiles where id = auth.uid()),
    'self'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.visible_user_ids(p_actor_id uuid DEFAULT auth.uid())
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  select *
  into v_actor
  from public.profiles
  where id = p_actor_id;

  if not found then
    return;
  end if;

  v_scope := coalesce(v_actor.data_scope, 'self');

  if v_scope = 'all' then
    return query
    select p.id
    from public.profiles p;
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query
    select p.id
    from public.profiles p
    where p.team_id = v_actor.team_id;
    return;
  end if;

  return query
  select v_actor.id;
end;
$function$
;

drop function if exists public.active_visible_user_ids(uuid);
delete from supabase_migrations.schema_migrations where version in ('20260819130100', '20260819110000');
select pg_notify('pgrst', 'reload schema');
commit;
