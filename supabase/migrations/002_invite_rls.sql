grant select on table public.invite_codes to anon, authenticated;
grant update (used_by, used_at) on table public.invite_codes to authenticated;

create policy "invite_codes_select_valid_for_signup"
  on public.invite_codes
  for select
  to anon, authenticated
  using (
    used_by is null
    and (expires_at is null or expires_at > timezone('utc'::text, now()))
  );

create policy "invite_codes_mark_used_by_self"
  on public.invite_codes
  for update
  to authenticated
  using (
    used_by is null
    and (expires_at is null or expires_at > timezone('utc'::text, now()))
  )
  with check (
    used_by = auth.uid()
    and used_at is not null
    and (expires_at is null or expires_at > timezone('utc'::text, now()))
  );
