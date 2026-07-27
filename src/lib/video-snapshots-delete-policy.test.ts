import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260727210000_allow_members_delete_own_video_snapshots.sql",
);

test("普通成员只能删除自己视频的快照", () => {
  assert.equal(existsSync(migrationPath), true, "缺少 video_metrics_snapshots 自有视频删除策略迁移");

  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /for\s+delete\s+to\s+authenticated/i);
  assert.match(sql, /videos\.id\s*=\s*video_metrics_snapshots\.video_id/i);
  assert.match(sql, /videos\.user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i);
});
