import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { runtimeRoleForCompanyRole } from "@/lib/company-permissions";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260819120000_company_role_and_group_mode.sql"),
  "utf8",
);

test("company role migration maps legacy owner without making it group-wide", () => {
  assert.match(sql, /add column if not exists company_role/i);
  assert.match(sql, /role = 'owner' then 'company_owner'/i);
  assert.match(sql, /company_role in \('member', 'admin', 'company_owner'\)/i);
  assert.doesNotMatch(sql, /drop column if exists company_role/i);
});

test("company owner runtime role cannot trigger legacy owner bypasses", () => {
  assert.equal(runtimeRoleForCompanyRole("company_owner"), "admin");
  assert.equal(runtimeRoleForCompanyRole("admin"), "admin");
  assert.equal(runtimeRoleForCompanyRole("member"), "member");
});

test("group mode stores only a token hash and has a bounded session", () => {
  assert.match(sql, /create table if not exists public\.group_mode_sessions/i);
  assert.match(sql, /token_hash text not null unique/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /is_group_mode_active\(p_token_hash text\)/i);
  assert.match(sql, /expires_at > timezone\('utc'::text, now\(\)\)/i);
});

test("group mode tables expose read policy and revoke client writes", () => {
  for (const table of ["group_permission_qualifications", "group_mode_sessions"]) {
    const tableSql = sql.slice(sql.indexOf(`on public.${table}`));
    assert.match(tableSql, /for select/i);
    assert.match(tableSql, new RegExp(`revoke insert, update, delete on table public\\.${table} from anon, authenticated`, "i"));
    assert.match(tableSql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(tableSql, /create policy "[^"]+ denied"/i);
  }
});

test("current and historical scope helpers have separate archived behavior", () => {
  assert.match(sql, /create or replace function public\.visible_user_ids_v2/i);
  assert.match(sql, /create or replace function public\.active_visible_user_ids_v2/i);
  assert.match(sql, /visible_user_ids_v2[\s\S]*archive_snapshot\s*->>\s*'team_id'/i);
  assert.match(sql, /active_visible_user_ids_v2[\s\S]*membership_status, 'active'\) <> 'archived'/i);
});

test("exemption RPCs do not keep the legacy owner bypass", () => {
  const review = sql.slice(sql.indexOf("create or replace function public.review_exemption_request_atomically_v2"));
  assert.match(sql, /apply_exemption_grant_atomically_v2[\s\S]*exemption_target_in_active_scope/i);
  assert.match(sql, /clear_exemption_grant_atomically_v2[\s\S]*exemption_target_in_active_scope/i);
  assert.match(review, /applicant_user_id <> auth\.uid\(\)/i);
  assert.match(review, /p_group_mode_token_hash/i);
  assert.doesNotMatch(review, /v_actor\.role\s*=\s*'owner'/i);
});

test("admin first-screen summary and pending submissions are scoped", () => {
  assert.match(sql, /admin_cockpit_summary_v2[\s\S]*exemption_target_in_active_scope/i);
  assert.match(sql, /admin_pending_submissions_today_v2[\s\S]*exemption_target_in_active_scope/i);
  assert.match(sql, /admin_cockpit_summary\(target_date date[\s\S]*admin_cockpit_summary_v2\(target_date, null\)/i);
  assert.match(sql, /admin_pending_submissions_today\(target_date date[\s\S]*admin_pending_submissions_today_v2\(target_date, null\)/i);
});
