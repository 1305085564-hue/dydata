import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260727193000_allow_members_delete_own_video_tags.sql",
);

test("普通成员只能删除自己视频的标签", () => {
  assert.equal(existsSync(migrationPath), true, "缺少 video_tags 自有视频删除策略迁移");

  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /for\s+delete\s+to\s+authenticated/i);
  assert.match(sql, /videos\.id\s*=\s*video_tags\.video_id/i);
  assert.match(sql, /videos\.user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i);
});
