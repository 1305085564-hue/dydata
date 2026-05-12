-- 修复线上 member_change_log 结构：可能缺 action_type 列
-- 原始 031_member_change_log.sql 在部分环境下未生效，导致只有基础列
-- 本 migration 做幂等补齐：缺列则加、缺约束则建

-- 确保 action_type 列存在
alter table public.member_change_log
  add column if not exists action_type text;

-- 回填历史数据（若有 null）为保守默认值，避免 not null 冲突
update public.member_change_log
  set action_type = 'transfer'
  where action_type is null;

-- 设为 not null（可重复执行不会报错，若已是 not null 则无变化）
alter table public.member_change_log
  alter column action_type set not null;

-- 重建 check 约束，放开 transfer_team
alter table public.member_change_log
  drop constraint if exists member_change_log_action_type_check;

alter table public.member_change_log
  add constraint member_change_log_action_type_check
  check (action_type in ('add', 'remove', 'transfer', 'transfer_team', 'disable'));
