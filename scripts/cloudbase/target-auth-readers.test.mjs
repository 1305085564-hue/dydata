import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { packSqlBatches, splitPostgresDump } from './sql-batches.mjs';

const authReaders = await readFile(new URL('./target-auth-readers.sql', import.meta.url), 'utf8');
const functionGuards = await readFile(new URL('./target-function-guards.sql', import.meta.url), 'utf8');

function bodyOf(source, name) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`, 'i'));
  assert.ok(match, `missing function body ${name}`);
  return match[1];
}

test('auth reader SQL is valid batchable SQL and does not mutate managed auth tables', () => {
  for (const sql of [authReaders, functionGuards]) {
    const statements = splitPostgresDump(sql);
    const batches = packSqlBatches(statements, { maxBytes: 256 * 1024, migrationId: 'auth-reader-guards-test' });
    assert.ok(statements.length >= 3);
    assert.ok(batches.length > 0);
    assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b[^;]*\b(?:TABLE\s+)?auth\.users\b/i);
    assert.doesNotMatch(sql, /\bOWNER\s+TO\s+postgres\b/i);
  }
});

test('subject lookup returns only the requested CloudBase subject projection under service_role', () => {
  const body = bodyOf(authReaders, 'cloudbase_auth_user_by_subject');
  assert.match(authReaders, /FUNCTION public\.cloudbase_auth_user_by_subject\(p_subject text\)\s+RETURNS jsonb/i);
  assert.match(authReaders, /SECURITY DEFINER\s+SET search_path\s*=\s*''/i);
  assert.match(body, /FROM auth\.users\s+AS u/i);
  assert.match(body, /WHERE u\.sub = p_subject/i);
  assert.match(body, /'id'\s*,\s*u\.sub/i);
  assert.match(body, /'email'\s*,\s*u\.email/i);
  assert.match(body, /'phone'\s*,\s*u\.phone_number/i);
  assert.match(body, /'app_metadata'\s*,\s*coalesce\(u\.raw_app_meta_data,\s*'\{\}'::jsonb\)/i);
  assert.match(body, /'user_metadata'\s*,\s*pg_catalog\.jsonb_build_object\('full_name',\s*u\.name\)/i);
  assert.match(body, /'created_at'\s*,\s*u\.created_at/i);
  assert.match(body, /'updated_at'\s*,\s*u\.updated_at/i);

  assert.match(authReaders, /REVOKE ALL PRIVILEGES ON FUNCTION public\.cloudbase_auth_user_by_subject\(text\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(authReaders, /GRANT EXECUTE ON FUNCTION public\.cloudbase_auth_user_by_subject\(text\) TO service_role/i);
  assert.doesNotMatch(authReaders, /GRANT EXECUTE ON FUNCTION public\.cloudbase_auth_user_by_subject\(text\)[^;]*TO\s+(?:anon|authenticated)/i);
});

test('paged reader clamps inputs, orders by the internal bigint, and returns sub as user id', () => {
  const body = bodyOf(authReaders, 'cloudbase_auth_users_page');
  assert.match(authReaders, /FUNCTION public\.cloudbase_auth_users_page\(\s*p_page integer DEFAULT 1,\s*p_per_page integer DEFAULT 50\s*\)\s*RETURNS jsonb/i);
  assert.match(authReaders, /SECURITY DEFINER\s+SET search_path\s*=\s*''/i);
  assert.match(body, /greatest\(coalesce\(p_page, 1\), 1\)/i);
  assert.match(body, /least\(greatest\(coalesce\(p_per_page, 50\), 1\), 200\)/i);
  assert.match(body, /ORDER BY u\.id\b/i);
  assert.match(body, /'id'\s*,\s*page_rows\.sub/i);
  assert.match(body, /'users'\s*,/i);
  assert.match(body, /'total'\s*,/i);
  assert.match(body, /'page'\s*,/i);
  assert.match(body, /'per_page'\s*,/i);
  assert.match(authReaders, /REVOKE ALL PRIVILEGES ON FUNCTION public\.cloudbase_auth_users_page\(integer, integer\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(authReaders, /GRANT EXECUTE ON FUNCTION public\.cloudbase_auth_users_page\(integer, integer\) TO service_role/i);
  assert.doesNotMatch(body, /u\.id\s*::\s*(?:integer|numeric|text)/i);
  assert.doesNotMatch(body, /encrypted_password|password_hash|raw_user_meta_data/i);
});

test('reminder count keeps its aggregate filters while enforcing active self-only authenticated access', () => {
  const body = bodyOf(functionGuards, 'count_remind_logs_for_user');
  assert.match(functionGuards, /count_remind_logs_for_user\(\s*p_user_id uuid,\s*p_target_date date,\s*p_days integer DEFAULT 7\s*\)\s*RETURNS integer/i);
  assert.match(functionGuards, /SECURITY DEFINER\s+SET search_path\s*=\s*''/i);
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'authenticated'/i);
  assert.match(body, /auth\.uid\(\)\)\s*::\s*uuid/i);
  assert.match(body, /p_user_id/i);
  assert.match(body, /membership_status\s*=\s*'active'/i);
  assert.match(body, /ERRCODE\s*=\s*'42501'/i);
  assert.match(body, /user_id\s*=\s*p_user_id\s+AND\s+target_date\s*<=\s*p_target_date\s+AND\s+target_date\s*>\s*\(p_target_date\s*-\s*\(p_days\s*\|\|\s*' days'\)::interval\)/i);
});

test('violation permission keeps legacy owner/admin permission semantics and requires active membership', () => {
  const body = bodyOf(functionGuards, 'has_violation_permission');
  assert.match(body, /membership_status\s*=\s*'active'/i);
  assert.match(body, /role\s*=\s*'owner'/i);
  assert.match(body, /role\s*=\s*'admin'\s+AND\s+\(permissions\s*->>\s*'manage_violations'\)::boolean\s*=\s*true/i);
  assert.match(body, /auth\.uid\(\)\)\s*::\s*uuid/i);
});

test('AI lifecycle adds the active owner/service guard first and preserves lifecycle operations', () => {
  const body = bodyOf(functionGuards, 'manage_ai_feature_lifecycle');
  const afterBegin = body.slice(body.toLowerCase().indexOf('begin') + 'begin'.length);
  assert.match(afterBegin, /^\s*IF auth\.role\(\) IS DISTINCT FROM 'service_role'[\s\S]*?OR public\.is_owner\(\) IS NOT TRUE[\s\S]*?ERRCODE\s*=\s*'42501'[\s\S]*?END IF;\s*if p_action/is);
  assert.match(body, /auth\.uid\(\)\)\s*::\s*uuid/i);
  for (const fragment of [
    "p_action not in ('archive', 'restore')",
    "'content_tools', 'period_insight', 'next_day_review', 'content_analysis'",
    'pg_advisory_xact_lock(hashtext(p_feature_key))',
    'insert into public.ai_feature_config_archives',
    'update public.ai_feature_bindings',
    'update public.ai_feature_config',
    "v_reason text := '管理员从 AI 总控停止使用'",
  ]) {
    assert.ok(body.includes(fragment), `original lifecycle logic is missing: ${fragment}`);
  }
});
