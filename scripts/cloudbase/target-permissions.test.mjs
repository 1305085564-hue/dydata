import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { packSqlBatches, splitPostgresDump } from './sql-batches.mjs';

const sql = await readFile(new URL('./target-permissions.sql', import.meta.url), 'utf8');

const expectedClasses = {
  R: [
    'public.case_library_actor_scope(uuid)',
    'public.case_library_inbox(uuid)',
    'public.case_library_inbox_counts(uuid)',
    'public.case_library_processed(uuid)',
    'public.count_remind_logs_for_user(uuid, date, integer)',
    'public.has_violation_permission()',
    'public.manage_ai_feature_lifecycle(text, text, text)',
    'public.publish_draft_actor_scope(uuid)',
    'public.publish_drafts_review_queue(uuid)',
    'public.review_team_join_request(uuid, text, text)',
  ],
  S: [
    'public.get_leaderboard_rows(date)',
    'public.admin_analytics_first_screen(uuid[], uuid, text, text, date, date, boolean, date, date)',
    'public.admin_anomaly_videos_today(uuid[], date, integer)',
    'public.admin_content_first_screen(uuid[], text, integer, integer)',
    'public.admin_first_screen_perf_regressions(text, integer, integer)',
    'public.admin_pending_violations(integer)',
    'public.admin_videos_first_screen(uuid[], text, integer, integer)',
    'public.bump_ai_channel_failure(uuid, text)',
    'public.cleanup_expired_notifications()',
    'public.conversion_hub_advice_list(integer)',
    'public.conversion_hub_pipeline_counts(date)',
    'public.conversion_hub_weekly_items(date, text)',
    'public.get_fulfillment_calendar(integer, integer, uuid[])',
    'public.get_fulfillment_range(date, date, uuid[], uuid, uuid)',
    'public.get_production_dashboard(date, uuid, uuid)',
    'public.publish_drafts_approved_list(integer, uuid, text)',
  ],
  O: [
    'public.get_today_submission_status()',
    'public.recalculate_script_usage_aggregate(uuid)',
    'public.touch_rewrite_conversation_last_message()',
    'public.update_script_usage_aggregate()',
    'public.validate_invite_code(text)',
  ],
};

function parseFunctionClasses(source) {
  const entries = [...source.matchAll(/\('([^']+)', '([RSO])'\)/g)]
    .map(([, signature, accessClass]) => [accessClass, signature]);
  return Object.fromEntries(['R', 'S', 'O'].map((accessClass) => [
    accessClass,
    entries.filter(([entryClass]) => entryClass === accessClass).map(([, signature]) => signature).sort(),
  ]));
}

test('SQL is batchable without embedded transaction control', () => {
  const statements = splitPostgresDump(sql);
  const batches = packSqlBatches(statements, {
    maxBytes: 256 * 1024,
    migrationId: 'cloudbase-target-permissions',
  });

  assert.ok(statements.length > 5);
  assert.ok(batches.length > 0);
  assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
});

test('all 31 audited functions receive the matrix access class and safe search path', () => {
  const actual = parseFunctionClasses(sql);
  for (const accessClass of ['R', 'S', 'O']) {
    assert.deepEqual(actual[accessClass], [...expectedClasses[accessClass]].sort());
  }
  assert.equal(Object.values(actual).flat().length, 31);

  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp/);
  assert.match(sql, /IF r\.access_class = 'R' THEN[\s\S]*?TO authenticated, service_role/);
  assert.match(sql, /ELSIF r\.access_class = 'S' THEN[\s\S]*?TO service_role/);
  assert.doesNotMatch(sql, /\bGRANT\b[^;]*\bTO\s+anon\b/i);
  assert.doesNotMatch(sql, /ALTER\s+FUNCTION\b[^;]*\bOWNER\s+TO\b/i);
  assert.doesNotMatch(sql, /\bpostgres\b/i);
});

test('leaderboard is restricted to the scoped server route', () => {
  assert.equal(parseFunctionClasses(sql).S.includes('public.get_leaderboard_rows(date)'), true);
  assert.match(sql, /scoped server route/);
});

test('join requests allow only active, unassigned applicants to create pending requests', () => {
  const permissive = sql.match(/CREATE POLICY "申请人仅可创建自己的 pending 申请"[\s\S]*?;/)?.[0];
  const restrictive = sql.match(/CREATE POLICY b3_team_join_requests_insert_active[\s\S]*?;/)?.[0];
  assert.ok(permissive);
  assert.ok(restrictive);

  for (const policy of [permissive, restrictive]) {
    assert.match(policy, /TO authenticated/);
    assert.match(policy, /applicant_user_id = \(\(auth\.uid\(\)\)::uuid\)/);
    assert.match(policy, /actor\.membership_status = 'active'/);
    assert.match(policy, /actor\.team_id IS NULL/);
    assert.match(policy, /status = 'pending'/);
  }
});

test('review RPC rejects invalid actions, cross-company reviewers, archived users, and existing members', () => {
  const body = sql.match(/CREATE OR REPLACE FUNCTION public\.review_team_join_request\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/)?.[1];
  assert.ok(body);
  assert.match(body, /IF p_action IS NULL OR p_action NOT IN \('approve', 'reject'\)/);
  assert.match(body, /v_actor\.membership_status IS DISTINCT FROM 'active'/);
  assert.match(body, /v_actor\.company_role IS DISTINCT FROM 'admin'/);
  assert.match(body, /v_actor\.company_role IS DISTINCT FROM 'company_owner'/);
  assert.match(body, /public\.has_permission\('manage_members'\) IS NOT TRUE/);
  assert.match(body, /v_request\.target_team_id IS DISTINCT FROM v_actor\.team_id/);
  assert.match(body, /v_applicant\.membership_status IS DISTINCT FROM 'active'/);
  assert.match(body, /v_applicant\.team_id IS NOT NULL/);
  assert.match(body, /FOR UPDATE/);
  assert.match(body, /\(\(auth\.uid\(\)\)::uuid\)/);
  assert.doesNotMatch(body, /p_source|source_tag/i);
});

test('group reassignment uses an authenticated same-company admin RPC with a private trigger gate', () => {
  const rpc = sql.match(/CREATE OR REPLACE FUNCTION public\.reassign_member_work_group\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/)?.[0];
  const body = rpc?.match(/\$function\$([\s\S]*?)\$function\$/)?.[1];
  assert.ok(rpc);
  assert.ok(body);
  assert.match(rpc, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'authenticated'/);
  assert.match(body, /v_actor_id uuid := \(\(auth\.uid\(\)\)::uuid\)/);
  assert.match(body, /v_actor\.membership_status IS DISTINCT FROM 'active'/);
  assert.match(body, /v_actor\.company_role IS DISTINCT FROM 'admin'/);
  assert.match(body, /v_actor\.company_role IS DISTINCT FROM 'company_owner'/);
  assert.match(body, /public\.has_permission\('manage_members'\) IS NOT TRUE/);
  assert.match(body, /p_member_id = v_actor_id/);
  assert.match(body, /v_member\.membership_status IS DISTINCT FROM 'active'/);
  assert.match(body, /v_member\.team_id IS DISTINCT FROM v_actor\.team_id/);
  assert.match(body, /v_actor\.company_role = 'admin'[\s\S]*?v_member\.company_role IS DISTINCT FROM 'member'/);
  assert.match(body, /v_actor\.company_role = 'company_owner'[\s\S]*?v_member\.company_role IS DISTINCT FROM 'admin'/);
  assert.equal(
    body.match(/company_role = 'member'\s+OR \(v_actor\.company_role = 'company_owner' AND company_role = 'admin'\)/g)?.length,
    2,
  );
  assert.match(body, /p_slot NOT IN \('peer', 'operator'\)/);
  assert.match(body, /p_slot = 'peer' AND v_group\.kind NOT IN \('writer', 'talent'\)/);
  assert.match(body, /p_slot = 'operator' AND v_group\.kind IS DISTINCT FROM 'operator'/);
  assert.match(body, /dydata\.internal_work_group_assignment/);
  assert.match(body, /INSERT INTO public\.audit_logs/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION public\.reassign_member_work_group\(uuid, text, uuid\)[\s\S]*?FROM PUBLIC, anon, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reassign_member_work_group\(uuid, text, uuid\)[\s\S]*?TO authenticated/);

  const trigger = sql.match(/CREATE OR REPLACE FUNCTION public\.guard_profile_work_group_assignment\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/)?.[0];
  const triggerBody = trigger?.match(/\$function\$([\s\S]*?)\$function\$/)?.[1];
  assert.ok(trigger);
  assert.ok(triggerBody);
  assert.match(trigger, /SECURITY INVOKER[\s\S]*?SET search_path = ''/);
  assert.match(triggerBody, /current_user = pg_catalog\.pg_get_userbyid\(v_reassign_owner\)/);
  assert.match(triggerBody, /auth\.uid\(\) IS NOT NULL/);
  assert.match(triggerBody, /v_marker IS NOT DISTINCT FROM pg_catalog\.concat/);
  assert.match(triggerBody, /IF v_service_role THEN[\s\S]*?NEW\.work_peer_group_id IS NOT NULL[\s\S]*?NEW\.work_operator_group_id IS NOT NULL/);
  assert.match(triggerBody, /pg_catalog\.pg_has_role\(current_user, v_profiles_owner, 'USAGE'\)/);
  assert.match(sql, /BEFORE UPDATE OF work_peer_group_id, work_operator_group_id[\s\S]*?EXECUTE FUNCTION public\.guard_profile_work_group_assignment\(\)/);
  assert.doesNotMatch(rpc, /p_source|source_tag/i);
});

test('ledger tables are owner-only under RLS and profiles column grants stay untouched', () => {
  const ledgers = [
    'public.ai_provider_priority_migration_backup_20261009',
    'public.appeal_backfill_20261019_ledger',
    'public.report_date_fix_20261019_ledger',
  ];
  for (const table of ledgers) {
    assert.ok(sql.includes(`to_regclass('${table}')`));
  }
  assert.match(sql, /ALTER TABLE %s ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*\b(?:ai_provider_priority_migration_backup_20261009|appeal_backfill_20261019_ledger|report_date_fix_20261019_ledger)\b/i);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE)\b[^;]*\bON\s+(?:TABLE\s+)?public\.profiles\b/i);
  assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|POLICY|FUNCTION)\s+auth\./i);
});
