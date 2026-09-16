-- Correct the correlated name resolution in the first B3 migration.
-- Compare the request row's team_id with the active actor's trusted profile.
alter policy b3_exemption_request_insert_scope on public.exemption_request
  with check (
    applicant_user_id = auth.uid()
    and (profile_id is null or profile_id = auth.uid())
    and team_id = (
      select actor.team_id
      from public.profiles actor
      where actor.id = auth.uid()
        and actor.membership_status = 'active'
    )
  );
