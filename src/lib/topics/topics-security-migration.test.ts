import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260912120000_topics_security_metrics_hardening.sql",
);

test("Topics 安全迁移锁定团队参数、题库主表与 service-role-only RPC", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /topics_pool_aggregates\s*\(\s*p_team_id\s+uuid/i);
  assert.match(sql, /from\s+public\.sub_topics/i);
  assert.match(sql, /library_status\s*=\s*'in_library'/i);
  assert.match(sql, /revoke\s+execute[\s\S]*from\s+public/i);
  assert.match(sql, /revoke\s+execute[\s\S]*from\s+anon/i);
  assert.match(sql, /revoke\s+execute[\s\S]*from\s+authenticated/i);
  assert.match(sql, /grant\s+execute[\s\S]*to\s+service_role/i);
  assert.doesNotMatch(sql, /group_scope|data_scope/i);
  assert.match(sql, /toggle_topic_library_atomic/i);
});

test("Topics 安全迁移收紧 active 同团队读取、直接写入与 claim 状态", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /membership_status\s*=\s*'active'/i);
  assert.match(sql, /team_id/i);
  assert.match(sql, /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.sub_topics[\s\S]*from\s+authenticated/i);
  assert.match(sql, /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.sub_topic_claims[\s\S]*from\s+authenticated/i);
  assert.match(sql, /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.topic_import_batches[\s\S]*from\s+authenticated/i);
  assert.match(sql, /status\s+in\s*\(\s*'writing'\s*,\s*'cancelled'\s*,\s*'completed'\s*\)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.sub_topics/i);
});
