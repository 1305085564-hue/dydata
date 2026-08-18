import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260819100000_admin_current_scope_archived.sql"),
  "utf8",
);

test("admin_pending_submissions_today 排除 archived 成员", () => {
  assert.match(sql, /create or replace function public\.admin_pending_submissions_today/i);
  assert.match(sql, /coalesce\(p\.membership_status,\s*'active'\)\s*<>\s*'archived'/i);
});

test("admin_cockpit_summary 的当前待办计数排除 archived 成员", () => {
  assert.match(sql, /create or replace function public\.admin_cockpit_summary/i);
  assert.match(sql, /pending_submissions_count[\s\S]*coalesce\(p\.membership_status,\s*'active'\)\s*<>\s*'archived'/i);
});
