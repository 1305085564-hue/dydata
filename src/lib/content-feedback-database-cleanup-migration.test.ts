import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260828120000_remove_content_feedback_workflow.sql",
);

function migrationSql() {
  assert.equal(existsSync(migrationPath), true, "反馈闭环数据库清理 migration 必须存在");
  return readFileSync(migrationPath, "utf8");
}

function sqlBlock(sql: string, start: string, end: string) {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `找不到 SQL 区块：${start}`);
  assert.notEqual(endIndex, -1, `找不到 SQL 区块结尾：${end}`);
  return sql.slice(startIndex, endIndex);
}

test("反馈闭环清理 migration 使用独立且完整的 20260828 时间戳", () => {
  assert.equal(existsSync(migrationPath), true, "反馈闭环数据库清理 migration 必须存在");
  const sql = migrationSql().trim();
  assert.match(sql, /^--[^\n]*\n\nbegin;/i, "破坏性 migration 必须显式开启事务");
  assert.match(sql, /commit;$/i, "破坏性 migration 必须在全部语句成功后提交");
});

test("首屏 RPC 去除反馈卡读模型，同时保留纯数据就绪判断", () => {
  const sql = migrationSql();
  const readModel = sqlBlock(
    sql,
    "create or replace function public.admin_content_first_screen",
    "-- 回收保护",
  );

  assert.match(readModel, /p_visible_user_ids uuid\[\][\s\S]*p_view text default 'pending'/i);
  assert.match(readModel, /v\.lifecycle_state = 'active'/i);
  assert.match(readModel, /'reviewReadiness'/);
  assert.match(readModel, /when not sv\.has_snapshot_24h then 'missing_snapshot'/i);
  assert.match(
    readModel,
    /when not sv\.has_snapshot_24h then 'missing_snapshot'[\s\S]*when coalesce\(vv\.content, ''\) = '' then 'missing_content'[\s\S]*when not sv\.has_segments then 'missing_segments'/i,
    "数据库和应用层必须按快照、文案、拆段的同一顺序判断就绪状态",
  );
  assert.match(readModel, /insight_type = 'content_analysis'/i);
  assert.doesNotMatch(readModel, /insight_type = 'next_day_review'/i);
  assert.match(readModel, /when exists\(select 1 from analyzed_ids[\s\S]*then 'analyzed'/i);
  assert.match(readModel, /sv\.has_snapshot_24h[\s\S]*and coalesce\(vv\.content, ''\) <> ''/i);
  assert.doesNotMatch(readModel, /content_feedback_cards|feedbackCards|reviewedVideoIds|workflowSummary|workflow_counts|feedback_rows|card_status|\bfr\./i);
});

test("视频提交回滚仅解除反馈表依赖，仍以其他视频资产决定回收或物理删除", () => {
  const sql = migrationSql();
  const rollback = sqlBlock(
    sql,
    "create or replace function public.rollback_new_video_submission",
    "-- 先卸载",
  );

  assert.match(rollback, /public\.video_metrics_snapshots/i);
  assert.match(rollback, /public\.video_tags/i);
  assert.match(rollback, /public\.video_content_segments/i);
  assert.match(rollback, /if has_history then[\s\S]*lifecycle_state = 'trashed'/i);
  assert.match(rollback, /delete from public\.videos/i);
  assert.equal(
    rollback.match(/return 'missing_or_unsafe';/gi)?.length,
    1,
    "危险回滚分支只能保留一条明确返回语句",
  );
  assert.doesNotMatch(rollback, /content_feedback_cards|feedback_card_replies|feedback_action_tasks|content_experience_marks/i);
});

test("先卸载函数和触发器，再按外键顺序删除反馈表，且不级联伤及其他资产", () => {
  const sql = migrationSql();
  const triggerIndex = sql.indexOf("drop trigger if exists trg_sync_feedback_action_tasks");
  const syncFunctionIndex = sql.indexOf("drop function if exists public.sync_feedback_action_tasks(uuid)");
  const replyFunctionIndex = sql.indexOf("drop function if exists public.submit_feedback_card_reply(uuid, uuid, text, text)");
  const marksTableIndex = sql.indexOf("drop table if exists public.content_experience_marks");
  const tasksTableIndex = sql.indexOf("drop table if exists public.feedback_action_tasks");
  const repliesTableIndex = sql.indexOf("drop table if exists public.feedback_card_replies");
  const cardsTableIndex = sql.indexOf("drop table if exists public.content_feedback_cards");

  for (const [name, index] of [
    ["任务同步触发器", triggerIndex],
    ["任务同步函数", syncFunctionIndex],
    ["反馈回复 RPC", replyFunctionIndex],
    ["经验标记表", marksTableIndex],
    ["反馈任务表", tasksTableIndex],
    ["反馈回复表", repliesTableIndex],
    ["反馈卡表", cardsTableIndex],
  ] as const) {
    assert.notEqual(index, -1, `必须显式删除${name}`);
  }

  assert.ok(triggerIndex < syncFunctionIndex);
  assert.ok(syncFunctionIndex < marksTableIndex);
  assert.ok(replyFunctionIndex < marksTableIndex);
  assert.ok(marksTableIndex < tasksTableIndex);
  assert.ok(tasksTableIndex < cardsTableIndex);
  assert.ok(repliesTableIndex < cardsTableIndex);
  assert.doesNotMatch(sql, /drop table[\s\S]*?(content_experience_marks|feedback_action_tasks|feedback_card_replies|content_feedback_cards)[^;]*\bcascade\b/i);
});

test("migration 不触碰协作归因 RPC", () => {
  assert.doesNotMatch(migrationSql(), /update_collaboration_attribution/i);
});
