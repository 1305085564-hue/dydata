-- ============================================================
-- 069: 通知去重索引收紧
-- 原 068 用了 partial unique index (where source_id is not null)，
-- supabase-js 的 upsert(onConflict) 在 PostgREST 层无法可靠匹配 partial unique，
-- 导致 emit 在唯一冲突时报错。这里改成完整唯一索引：
--   1) 历史空值用空字符串兜底
--   2) source_type / source_id 改为 not null + default ''
--   3) 用完整唯一索引替代 partial unique
-- 全部 idempotent，对存量数据零风险（空值变 ''，仍能去重）。
-- ============================================================

-- 1) 历史空值兜底
update public.notifications set source_type = '' where source_type is null;
update public.notifications set source_id   = '' where source_id   is null;

-- 2) 列约束收紧
alter table public.notifications
  alter column source_type set default '',
  alter column source_id   set default '',
  alter column source_type set not null,
  alter column source_id   set not null;

-- 3) 替换索引：drop 旧 partial → 建新完整唯一索引
drop index if exists public.idx_notifications_dedupe;

create unique index if not exists idx_notifications_dedupe
  on public.notifications (user_id, type, source_type, source_id);
