import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260728120000_atomic_collaboration_attribution.sql", import.meta.url),
  "utf8",
);

test("归属补录 RPC 在一次数据库事务里锁定日报并同步更新日报与视频", () => {
  assert.match(sql, /create or replace function public\.update_collaboration_attribution/i);
  assert.match(sql, /from public\.daily_reports[\s\S]*for update/i);
  assert.match(sql, /report_date\s*>=\s*date\s*'2026-07-27'/i);
  assert.match(sql, /update public\.daily_reports/i);
  assert.match(sql, /update public\.videos/i);
  assert.match(sql, /lifecycle_state\s*=\s*'active'/i);
  assert.match(sql, /timezone\('Asia\/Shanghai',[\s\S]*published_at/i);
  assert.match(sql, /timezone\('Asia\/Shanghai',[\s\S]*uploaded_at/i);
});

test("视频软配对不到时 RPC 不抛错并返回 videoUpdated false", () => {
  assert.match(sql, /if v_video_id is not null then[\s\S]*update public\.videos/i);
  assert.match(sql, /'videoUpdated',[\s\S]*v_video_id is not null/i);
  assert.doesNotMatch(sql, /v_video_id is null then[\s\S]*raise exception/i);
});

test("归属补录 RPC 只授权 service_role 调用", () => {
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});
