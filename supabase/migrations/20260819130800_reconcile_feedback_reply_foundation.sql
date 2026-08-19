-- Restore the feedback reply foundation required by 20260718104500.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_feedback_cards'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (select attnum
         from pg_attribute
         where attrelid = 'public.content_feedback_cards'::regclass
           and attname = 'id'
           and not attisdropped)
      ]::smallint[]
  ) then
    alter table public.content_feedback_cards
      add constraint content_feedback_cards_pkey primary key (id);
  end if;
end;
$$;

alter table public.content_feedback_cards
  add column if not exists employee_reply_status text not null default 'pending',
  add column if not exists employee_reply_text text,
  add column if not exists employee_replied_at timestamptz,
  add column if not exists employee_replied_by uuid references public.profiles(id) on delete set null;

alter table public.content_feedback_cards
  drop constraint if exists content_feedback_cards_employee_reply_status_check;

alter table public.content_feedback_cards
  add constraint content_feedback_cards_employee_reply_status_check
  check (employee_reply_status in ('pending', 'acknowledged', 'disputed'));

create table if not exists public.feedback_card_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_card_id uuid not null references public.content_feedback_cards(id) on delete cascade,
  reply_status text not null check (reply_status in ('acknowledged', 'disputed')),
  reply_text text not null,
  replied_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_card_replies_card_created
  on public.feedback_card_replies(feedback_card_id, created_at desc);

grant select, insert, update, delete on public.feedback_card_replies to authenticated;
grant select, insert, update, delete on public.feedback_card_replies to service_role;

alter table public.feedback_card_replies enable row level security;

drop policy if exists "feedback_card_replies_select" on public.feedback_card_replies;
create policy "feedback_card_replies_select"
  on public.feedback_card_replies
  for select
  using (
    public.is_admin()
    or replied_by = auth.uid()
    or exists (
      select 1
      from public.content_feedback_cards cfc
      where cfc.id = feedback_card_id
        and cfc.target_user_id = auth.uid()
    )
  );

drop policy if exists "feedback_card_replies_insert" on public.feedback_card_replies;
create policy "feedback_card_replies_insert"
  on public.feedback_card_replies
  for insert
  with check (
    replied_by = auth.uid()
    or public.is_admin()
  );
