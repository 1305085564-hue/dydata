CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE OR REPLACE FUNCTION private.is_active_topic_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = (select (auth.uid())::uuid)
      and actor.membership_status = 'active'
      and actor.team_id is not null
  )
$function$;
REVOKE ALL ON FUNCTION private.is_active_topic_member() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.is_active_topic_member() TO authenticated;
CREATE OR REPLACE FUNCTION private.can_read_team_topic(p_sub_topic_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles actor
    join public.sub_topics st on st.id = p_sub_topic_id
    join public.profiles creator on creator.id = st.created_by
    where actor.id = (select (auth.uid())::uuid)
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and creator.team_id = actor.team_id
  )
$function$;
REVOKE ALL ON FUNCTION private.can_read_team_topic(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.can_read_team_topic(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.can_read_team_claim(p_claim_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles actor
    join public.sub_topic_claims claim on claim.id = p_claim_id
    join public.sub_topics st on st.id = claim.sub_topic_id
    join public.profiles creator on creator.id = st.created_by
    join public.profiles claimant on claimant.id = claim.user_id
    where actor.id = (select (auth.uid())::uuid)
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and st.library_status = 'in_library'
      and creator.team_id = actor.team_id
      and claimant.team_id = actor.team_id
  )
$function$;
REVOKE ALL ON FUNCTION private.can_read_team_claim(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.can_read_team_claim(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.can_read_team_actor(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = p_target_user_id
    where actor.id = (select (auth.uid())::uuid)
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and target.team_id = actor.team_id
  )
$function$;
REVOKE ALL ON FUNCTION private.can_read_team_actor(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.can_read_team_actor(uuid) TO authenticated;
