-- 收口：script_document / tag_definition 的读策略从 {public} 收紧为 {authenticated}
--
-- 收口依据
--   1) docs/reference/2026-10-05-0100-RLS与权限函数线上只读核验.md 第五节（异常项登记）：
--      script_document.script_document_public_read、tag_definition.tag_definition_read
--      均为 roles={public}、cmd=SELECT、qual=true。PostgreSQL 的 public 角色包含 anon，
--      即未登录者可读全表。
--   2) 阿禅 2026-10-05 拍板：两表无匿名读取消费者，按同类主数据现有口径
--      （teams / visual_tags / violation_case_visual_tags 均为 roles={authenticated} + qual=true）对齐。
--   3) 消费者复核（2026-10-05，全量 grep 而非照抄）：
--      `rg -n "script_document|tag_definition" src/` 仅命中
--      src/lib/ai/insight-period.ts:191（登录态嵌套查询，经 content_tag_link 读 tag_definition）；
--      script_document 零引用。收口零业务影响。
--
-- 策略名变更登记
--   旧名 tag_definition_read 被历史快照 docs/plans/cleanup-batches/2026-09-19-permission-rls-policies.txt:389
--   引用；旧名 script_document_public_read 见同文件 :370。历史快照不回改。
--   新名：script_document_authenticated_read / tag_definition_authenticated_read。
--
-- 范围：只动这两张表的两条 SELECT 策略，其余策略一律不碰。

drop policy script_document_public_read on public.script_document;
create policy script_document_authenticated_read on public.script_document
  for select to authenticated using (true);

drop policy tag_definition_read on public.tag_definition;
create policy tag_definition_authenticated_read on public.tag_definition
  for select to authenticated using (true);
