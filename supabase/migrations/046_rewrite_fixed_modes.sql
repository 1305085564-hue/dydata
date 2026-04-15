-- 046: 文案改写固定能力套餐

create table if not exists public.rewrite_fixed_modes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  fixed_prompt text not null,
  model_view_id uuid not null references public.rewrite_model_views(id) on delete restrict,
  length_preset_id uuid references public.rewrite_length_presets(id) on delete set null,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.rewrite_conversations
  add column if not exists selected_fixed_mode_id uuid references public.rewrite_fixed_modes(id) on delete set null;

create index if not exists idx_rewrite_fixed_modes_enabled_sort
  on public.rewrite_fixed_modes(is_enabled, sort_order asc);

drop trigger if exists set_rewrite_fixed_modes_updated_at on public.rewrite_fixed_modes;
create trigger set_rewrite_fixed_modes_updated_at
before update on public.rewrite_fixed_modes
for each row
execute function public.set_rewrite_updated_at();

alter table public.rewrite_fixed_modes enable row level security;

drop policy if exists "rewrite_fixed_modes_read_enabled" on public.rewrite_fixed_modes;
drop policy if exists "rewrite_fixed_modes_owner_full" on public.rewrite_fixed_modes;
drop policy if exists "rewrite_fixed_modes_service_role_bypass" on public.rewrite_fixed_modes;
create policy "rewrite_fixed_modes_read_enabled"
  on public.rewrite_fixed_modes
  for select
  using (auth.role() = 'authenticated' and is_enabled = true);
create policy "rewrite_fixed_modes_owner_full"
  on public.rewrite_fixed_modes
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_fixed_modes_service_role_bypass"
  on public.rewrite_fixed_modes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.rewrite_fixed_modes to authenticated;
grant select, insert, update, delete on public.rewrite_fixed_modes to service_role;

with model_refs as (
  select id, key
  from public.rewrite_model_views
  where key in ('gemini', 'opus')
),
length_ref as (
  select id
  from public.rewrite_length_presets
  where key = 'standard'
  limit 1
)
insert into public.rewrite_fixed_modes (
  key,
  name,
  description,
  fixed_prompt,
  model_view_id,
  length_preset_id,
  sort_order,
  is_enabled
)
select
  seed.key,
  seed.name,
  seed.description,
  seed.fixed_prompt,
  model_refs.id,
  length_ref.id,
  seed.sort_order,
  true
from (
  values
    (
      'strong_framework',
      '强框架模式',
      '优先拉齐结构、信息排序、开头抓力和整体节奏。',
      '你现在执行的是“强框架模式”。优先重做结构框架、信息顺序、开头抓力、层次推进和节奏感。先让内容站得住、顺得下、抓得住，再考虑文采。不要堆花哨情绪词，不要把稿子写散，不要改动事实边界。',
      'gemini',
      10
    ),
    (
      'strong_tone',
      '强语感模式',
      '优先提升口播顺滑度、情绪张力和真人表达感。',
      '你现在执行的是“强语感模式”。优先强化语感、口播顺滑度、情绪张力和人话表达，让稿子更像成熟作者直接说出来的话。可以增强感染力和发布感，但不要低俗、不要失真、不要突破事实边界。',
      'opus',
      20
    )
) as seed(key, name, description, fixed_prompt, model_view_key, sort_order)
join model_refs
  on model_refs.key = seed.model_view_key
left join length_ref
  on true
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  fixed_prompt = excluded.fixed_prompt,
  model_view_id = excluded.model_view_id,
  length_preset_id = excluded.length_preset_id,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled;
