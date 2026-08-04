-- Member lifecycle: keep team assignment and account availability as separate states.
alter table public.profiles
  add column if not exists membership_status text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_snapshot jsonb;

update public.profiles
set membership_status = 'active'
where membership_status is null;

alter table public.profiles
  alter column membership_status set default 'active',
  alter column membership_status set not null;

alter table public.profiles
  drop constraint if exists profiles_membership_status_check;

alter table public.profiles
  add constraint profiles_membership_status_check
  check (membership_status in ('active', 'archived'));

create index if not exists idx_profiles_membership_status
  on public.profiles(membership_status);

create index if not exists idx_profiles_archived_at
  on public.profiles(archived_at desc)
  where membership_status = 'archived';

comment on column public.profiles.membership_status is
  '账号生命周期：active 可使用，archived 已归档但保留全部业务数据';
comment on column public.profiles.archive_snapshot is
  '归档前的角色、权限、团队和分组快照，仅用于审计追溯，不用于自动恢复';

alter table public.member_change_log
  drop constraint if exists member_change_log_action_type_check;

alter table public.member_change_log
  add constraint member_change_log_action_type_check
  check (
    action_type in (
      'add',
      'remove',
      'transfer',
      'transfer_team',
      'remove_from_team',
      'archive',
      'restore',
      'disable'
    )
  );

create index if not exists idx_member_change_log_user_effective_at
  on public.member_change_log(user_id, effective_at desc);
