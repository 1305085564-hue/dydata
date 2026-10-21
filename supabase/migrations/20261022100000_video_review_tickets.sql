create table if not exists public.video_review_tickets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  issue_tag text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'withdrawn')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists video_review_tickets_assignee_status_idx
  on public.video_review_tickets (assignee_id, status, created_at desc);
create index if not exists video_review_tickets_reporter_status_idx
  on public.video_review_tickets (reporter_id, status, created_at desc);
create unique index if not exists video_review_tickets_pending_video_unique
  on public.video_review_tickets (video_id)
  where status = 'pending';

alter table public.video_review_tickets enable row level security;

create policy "video review tickets related users can read"
  on public.video_review_tickets for select
  using (reporter_id = auth.uid() or assignee_id = auth.uid());

create policy "video review tickets related users can update"
  on public.video_review_tickets for update
  using (reporter_id = auth.uid() or assignee_id = auth.uid())
  with check (reporter_id = auth.uid() or assignee_id = auth.uid());

create policy "video review tickets related users can delete"
  on public.video_review_tickets for delete
  using (reporter_id = auth.uid() or assignee_id = auth.uid());

create or replace function public.create_video_review_ticket(
  p_video_id uuid,
  p_reporter_id uuid,
  p_assignee_id uuid,
  p_issue_tag text
)
returns public.video_review_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.video_review_tickets;
begin
  if auth.role() <> 'service_role' then
    raise exception 'video review tickets are server-side only' using errcode = '42501';
  end if;

  insert into public.video_review_tickets (video_id, reporter_id, assignee_id, issue_tag)
  values (p_video_id, p_reporter_id, p_assignee_id, p_issue_tag)
  returning * into v_ticket;

  return v_ticket;
end;
$$;

create or replace function public.delete_video_review_ticket(
  p_ticket_id uuid,
  p_reporter_id uuid
)
returns public.video_review_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.video_review_tickets;
begin
  if auth.role() <> 'service_role' then
    raise exception 'video review tickets are server-side only' using errcode = '42501';
  end if;

  delete from public.video_review_tickets
  where id = p_ticket_id
    and reporter_id = p_reporter_id
    and status = 'pending'
    and created_at >= now() - interval '5 seconds'
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'ticket_delete_window_expired' using errcode = '42501';
  end if;
  return v_ticket;
end;
$$;

create or replace function public.withdraw_video_review_ticket(
  p_ticket_id uuid,
  p_reporter_id uuid
)
returns public.video_review_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.video_review_tickets;
begin
  if auth.role() <> 'service_role' then
    raise exception 'video review tickets are server-side only' using errcode = '42501';
  end if;

  update public.video_review_tickets
  set status = 'withdrawn', resolved_at = now()
  where id = p_ticket_id
    and reporter_id = p_reporter_id
    and status = 'pending'
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'ticket_not_pending_or_not_reporter' using errcode = '42501';
  end if;
  return v_ticket;
end;
$$;

create or replace function public.resolve_video_review_ticket(
  p_ticket_id uuid,
  p_assignee_id uuid,
  p_issue_tag text
)
returns public.video_review_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.video_review_tickets;
begin
  if auth.role() <> 'service_role' then
    raise exception 'video review tickets are server-side only' using errcode = '42501';
  end if;

  update public.video_review_tickets
  set status = 'resolved', issue_tag = p_issue_tag, resolved_at = now()
  where id = p_ticket_id
    and assignee_id = p_assignee_id
    and status = 'pending'
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'ticket_not_pending_or_not_assignee' using errcode = '42501';
  end if;
  return v_ticket;
end;
$$;

revoke all on function public.create_video_review_ticket(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_video_review_ticket(uuid, uuid) from public, anon, authenticated;
revoke all on function public.withdraw_video_review_ticket(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_video_review_ticket(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_video_review_ticket(uuid, uuid, uuid, text) to service_role;
grant execute on function public.delete_video_review_ticket(uuid, uuid) to service_role;
grant execute on function public.withdraw_video_review_ticket(uuid, uuid) to service_role;
grant execute on function public.resolve_video_review_ticket(uuid, uuid, text) to service_role;
