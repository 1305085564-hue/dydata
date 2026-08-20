import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260820100000_owner_group_mode_access.sql"),
  "utf8",
);

test("集团模式数据库迁移：公司所有者无需资格表记录，手动退出前保持有效", () => {
  assert.match(sql, /alter column expires_at drop not null/i);
  assert.match(sql, /v_role = 'company_owner'/i);
  assert.match(sql, /v_membership_status <> 'archived'/i);
  assert.doesNotMatch(sql, /from public\.group_permission_qualifications/i);
  assert.match(sql, /s\.expires_at is null or s\.expires_at > timezone\('utc'::text, now\(\)\)/i);
});
