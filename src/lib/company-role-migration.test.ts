import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { runtimeRoleForCompanyRole } from "@/lib/company-permissions";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016090000_remove_group_mode.sql"),
  "utf8",
);

test("permission cleanup preserves company role mapping", () => {
  assert.match(sql, /role = 'owner' then 'company_owner'/i);
  assert.match(sql, /company_role_for_user/i);
  assert.match(sql, /drop table if exists public\.group_mode_sessions cascade/i);
});

test("company owner runtime role cannot trigger legacy owner bypasses", () => {
  assert.equal(runtimeRoleForCompanyRole("company_owner"), "admin");
  assert.equal(runtimeRoleForCompanyRole("admin"), "admin");
  assert.equal(runtimeRoleForCompanyRole("member"), "member");
});
