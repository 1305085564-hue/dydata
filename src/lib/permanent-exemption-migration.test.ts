import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20261002144830_permanent_exemption_owner_toggle.sql", import.meta.url),
  "utf8",
);

test("Owner-only permanent exemption migration has separate atomic set and clear functions", () => {
  assert.match(sql, /create or replace function public\.set_permanent_exemption_owner_atomically/i);
  assert.match(sql, /create or replace function public\.clear_permanent_exemption_owner_atomically/i);
  assert.match(sql, /company_role_for_user\(auth\.uid\(\)\) <> 'company_owner'/i);
  assert.match(sql, /exemption_target_in_active_scope\(auth\.uid\(\), p_user_id, p_group_mode_token_hash\)/i);
  assert.match(sql, /insert into public\.audit_logs/i);
  assert.match(sql, /grant execute on function public\.set_permanent_exemption_owner_atomically/i);
  assert.match(sql, /grant execute on function public\.clear_permanent_exemption_owner_atomically/i);
});

test("clearing permanent exemption restores an active temporary grant instead of blindly clearing profile state", () => {
  assert.match(sql, /grant_type <> 'permanent'[\s\S]*status = 'active'[\s\S]*order by created_at desc/i);
  assert.match(sql, /exempt_type = 'temporary'/i);
  assert.match(sql, /restored_temporary/);
});
