import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePermissionRepair, generatePermissionViewRepair, generatePermissionRepairGroups, TARGET_ENV, TARGET_DATABASE, TARGET_VERSION } from './permission-repair.mjs';
import { splitPostgresDump } from './sql-batches.mjs';

const owner = 'fixture_database_owner';
function fn(name, source = '\n SELECT true;\n', language = 'sql', args = '') {
  return { oid: name, schema: 'public', name, signature: `${name}(${args})`, identityArgs: args, source, language, result: 'boolean', retset: false, secdef: true, authenticated: true, ownerBypass: true, owner, config: ['search_path=""'], acl: [`${owner}=X/${owner}`, `authenticated=X/${owner}`, `service_role=X/${owner}`], def: `CREATE OR REPLACE FUNCTION public.${name}(${args}) RETURNS boolean LANGUAGE ${language} SECURITY DEFINER SET search_path TO '' AS $function$${source}$function$` };
}
function appeal(name) {
  const resolve = name === 'handle_fulfillment_appeal' ? `  resolved_handler_id := coalesce(\n    p_handler_id,\n    (auth.uid())::uuid\n  );\n` : '';
  return fn(name, `\nDECLARE\n appeal_record public.fulfillment_appeals%rowtype;\n resolved_handler_id uuid;\nBEGIN\n  if not public.is_admin_or_owner() then\n    raise exception 'permission denied';\n  end if;\n${resolve}  SELECT * INTO appeal_record FROM public.fulfillment_appeals WHERE id=p_appeal_id\n  for update;\n  INSERT INTO public.audit_logs(user_id) VALUES(resolved_handler_id);\n  RETURN true;\nEND;\n`, 'plpgsql', 'uuid');
}
function baseline() {
  const policy = (name, command = '*') => ({ name, command, permissive: true, roles: ['public'], using: command === 'a' ? null : 'is_admin()', check: ['*', 'a', 'w'].includes(command) ? 'is_admin()' : null });
  const tables = ['profiles', 'fulfillment_appeals', 'content_observations', 'sample_quality_issues', 'videos', ...Array.from({ length: 84 }, (_, i) => `business_${i}`)].map(name => ({ name, read: true, rls: true, owner, policies: [] }));
  tables.find(t => t.name === 'fulfillment_appeals').policies = [{ ...policy('Admins manage fulfillment appeals'), roles: ['authenticated'] }];
  tables.find(t => t.name === 'content_observations').policies = [policy('管理员管理内容观察')];
  tables.find(t => t.name === 'sample_quality_issues').policies = [policy('quality_insert', 'a'), policy('quality_select', 'r'), policy('quality_update', 'w')];
  const functions = [appeal('handle_fulfillment_appeal'), appeal('reopen_fulfillment_appeal_atomically'), ...['review_exemption_request_atomically', 'review_exemption_request_atomically_v2', 're_review_exemption_request_atomically'].map(name => fn(name)), ...Array.from({ length: 37 }, (_, i) => fn(`permission_${i}`))];
  return { envId: TARGET_ENV, database: TARGET_DATABASE, version: TARGET_VERSION, requestId: 'fixture', tables, functions };
}

test('generator is offline, fixed to the audited isolated environment and inventory', () => {
  const snapshot = baseline();
  assert.throws(() => generatePermissionRepair(snapshot, { envId: 'production' }), /Wrong isolated/);
  for (const field of ['envId', 'database', 'version']) assert.throws(() => generatePermissionRepair({ ...snapshot, [field]: 'different' }), /Wrong isolated/);
  assert.throws(() => generatePermissionRepair({ ...snapshot, tables: snapshot.tables.slice(1) }), /89/);
  assert.throws(() => generatePermissionRepair({ ...snapshot, functions: snapshot.functions.slice(1) }), /inventory/);
  snapshot.functions[0].ownerBypass = false;
  assert.throws(() => generatePermissionRepair(snapshot), /owner changed/);
});

test('every batch is one atomic statement, reentrant, version checked and individually reversible', () => {
  const plan = generatePermissionRepair(baseline(), { allowLegacyRpcRevoke: true });
  assert.equal(plan.batches.length, 144);
  assert.equal(new Set(plan.batches.map(b => b.id)).size, plan.batches.length);
  assert.deepEqual(plan.rollbackOrder, plan.batches.map(b => b.id).reverse());
  for (const batch of plan.batches) for (const sql of [batch.apply, batch.rollback]) {
    assert.equal(splitPostgresDump(sql).length, 1, batch.id);
    assert.match(sql, /current_database\(\).*postgres-nj1t015u/);
    assert.match(sql, /server_version/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /THEN RETURN; END IF/);
    assert.match(sql, /baseline drift/);
    assert.doesNotMatch(sql, /\bCASCADE\b|\bTRUNCATE\b|ALTER TABLE[^;]*DISABLE ROW|SET ROLE/i);
  }
});

test('one nonrecursive trusted state predicate gates all 89 tables and all 42 client definer functions', () => {
  const plan = generatePermissionRepair(baseline());
  const active = plan.batches.find(b => b.id === 'helper-cloudbase_current_actor_active_v2').apply;
  const status = plan.batches.find(b => b.id === 'helper-cloudbase_session_status').apply;
  assert.match(status, /auth\.users u ON u\.sub=p\.id::text/);
  assert.match(status, /membership_status=''active'' AND u\.status=1/);
  assert.match(active, /public\.cloudbase_session_status\(\)=''active''/);
  assert.doesNotMatch(status, /PERFORM public\.cloudbase_require|password|email|phone/);
  assert.match(status, /p\.id=\(auth\.uid\(\)\)::uuid/);
  assert.doesNotMatch(status, /GRANT EXECUTE[^;]*service_role/);
  assert.doesNotMatch(active, /is_admin|visible_user|cloudbase_require/);
  assert.match(active, /SECURITY DEFINER SET search_path = ''''/);
  assert.equal(plan.batches.filter(b => b.id.startsWith('R01-')).length, 42);
  const policies = plan.batches.filter(b => b.apply.includes('cb_permission_v2_active'));
  assert.equal(policies.length, 89);
  for (const b of policies) assert.match(b.apply, /AS RESTRICTIVE FOR ALL TO "authenticated"/);
  for (const b of plan.batches.filter(b => b.id.startsWith('R01-'))) {
    assert.match(b.apply, /PERFORM public\.cloudbase_require_active_actor_v2/);
    assert.match(b.apply, /proconfig IS NOT DISTINCT/);
    assert.match(b.apply, /unnest\(p\.proacl::text\[\]\)/);
    assert.match(b.rollback, /CREATE OR REPLACE FUNCTION/);
  }
});

test('unexpected SQL bodies are rejected and original single SELECT/table semantics are retained', () => {
  const snapshot = baseline();
  const bad = fn('bad_body', 'SELECT true; SELECT false;');
  snapshot.functions[5] = bad;
  assert.throws(() => generatePermissionRepair(snapshot), /single SELECT/);
  snapshot.functions[5] = { ...fn('table_body', 'SELECT user_id FROM public.some_scope()'), retset: true };
  const plan = generatePermissionRepair(snapshot);
  const batch = plan.batches.find(b => b.object === 'public.table_body()');
  assert.match(batch.apply, /RETURN QUERY SELECT user_id FROM public\.some_scope\(\)/);
  assert.match(batch.rollback, /LANGUAGE sql/);
  assert.doesNotMatch(batch.rollback, /DROP FUNCTION/);
});

test('three scoped policy replacements retain read history, active writes and trusted account ownership', () => {
  const plan = generatePermissionRepair(baseline());
  for (const name of ['fulfillment_appeals', 'content_observations', 'sample_quality_issues']) {
    const b = plan.batches.find(b => b.id.startsWith(`policy-${name}-`) && b.apply.includes('cb_permission_v2_scope'));
    assert.match(b.apply, /public\.visible_user_ids\(\(auth\.uid\(\)\)::uuid\)/);
    assert.match(b.apply, /public\.active_visible_user_ids\(\(auth\.uid\(\)\)::uuid\)/);
    assert.doesNotMatch(b.apply, /team_id/);
    assert.match(b.apply, /WITH CHECK/);
    if (name !== 'fulfillment_appeals') assert.match(b.apply, /a\.profile_id=v\.user_id/);
    if (name === 'sample_quality_issues') assert.match(b.apply, /public\.daily_reports/);
  }
});

test('video boundary protects inserts and changed reviews while preserving unchanged historical topics', () => {
  const b = generatePermissionRepair(baseline()).batches.find(b => b.id === 'helper-cloudbase_guard_video_write_v2');
  assert.match(b.apply, /SECURITY INVOKER/);
  assert.match(b.apply, /TG_OP=''INSERT''/);
  assert.match(b.apply, /NEW\.review_status IS DISTINCT FROM ''pending''/);
  assert.match(b.apply, /NEW\.reviewed_by:=actor/);
  assert.match(b.apply, /ROW\(NEW\.topic_id,NEW\.user_id,NEW\.account_id\) IS DISTINCT FROM ROW\(OLD/);
  assert.match(b.apply, /private\.can_read_team_topic/);
  assert.match(b.apply, /st\.library_status=''in_library''/);
  assert.doesNotMatch(b.apply, /sub_topic_claims|DELETE FROM|UPDATE public\.videos/);
});

test('appeal processing requires genuine actor, active scope and no self-review, preserving atomic audit', () => {
  const plan = generatePermissionRepair(baseline());
  for (const name of ['handle_fulfillment_appeal', 'reopen_fulfillment_appeal_atomically']) {
    const b = plan.batches.find(b => b.object === `public.${name}(uuid)`);
    assert.match(b.apply, /p_handler_id IS DISTINCT FROM resolved_handler_id/);
    assert.match(b.apply, /appeal_record\.user_id=resolved_handler_id/);
    assert.match(b.apply, /active_visible_user_ids\(resolved_handler_id\)/);
    assert.match(b.apply, /INSERT INTO public\.audit_logs/);
    assert.match(b.apply, /auth\.role\(\)=''service_role'' THEN p_handler_id/);
  }
  const guard = plan.batches.find(b => b.id === 'helper-cloudbase_guard_appeal_write_v2').apply;
  assert.match(guard, /SECURITY INVOKER/);
  assert.match(guard, /current_user=''fixture_database_owner''/);
  assert.match(guard, /TG_OP <> ''INSERT''/);
  assert.match(guard, /NEW\.status IS DISTINCT FROM ''pending''/);
  assert.match(guard, /NEW\.decision_reason IS NOT NULL/);
});

test('legacy RPC revocation requires explicit caller confirmation and restores exact client ACL', () => {
  assert.equal(generatePermissionRepair(baseline()).blocked.length, 1);
  const plan = generatePermissionRepair(baseline(), { allowLegacyRpcRevoke: true });
  const legacy = plan.batches.filter(b => b.id.startsWith('R12-'));
  assert.equal(legacy.length, 3);
  for (const b of legacy) {
    assert.match(b.apply, /REVOKE ALL ON FUNCTION.*FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(b.apply, /DROP FUNCTION|REVOKE[^;]*FROM[^;]*service_role/);
    assert.match(b.rollback, /GRANT EXECUTE ON FUNCTION.*TO "authenticated"/);
  }
});

function viewBaseline() {
  return { envId: TARGET_ENV, database: TARGET_DATABASE, version: TARGET_VERSION, requestId: 'view-fixture', readViews: ['ai_unified_config_view', 'pg_stat_statements', 'pg_stat_statements_info'].map((name, i) => ({
    name, schema: 'public', kind: 'v', oid: String(100 + i), owner, options: null, comment: null,
    def: name === 'ai_unified_config_view' ? ' SELECT prompt FROM public.ai_feature_config;' : ' SELECT 1 AS value;',
    columns: [{ name: name === 'ai_unified_config_view' ? 'prompt' : 'value', type: 'text', attacl: null }],
    acl: [`${owner}=arwdDxtm/${owner}`, `service_role=arwdDxtm/${owner}`, `${name === 'ai_unified_config_view' ? 'authenticated=arwdDxtm' : '=r'}/${owner}`],
  })) };
}

test('view supplement freezes identity and keeps core batches unchanged', () => {
  const core = baseline();
  const groups = generatePermissionRepairGroups(core, viewBaseline(), { allowLegacyRpcRevoke: true, allowStatisticsViewRevoke: true });
  assert.deepEqual(groups.core.batches, generatePermissionRepair(core, { allowLegacyRpcRevoke: true }).batches);
  assert.equal(groups.core.batches.length, 144);
  assert.equal(groups.views.batches.length, 2);
  assert.deepEqual(groups.views.rollbackOrder, ['R01-views-statistics-acl', 'R01-views-ai-state']);
  assert.equal(generatePermissionViewRepair(viewBaseline()).blocked.length, 1);
  assert.throws(() => generatePermissionViewRepair({ ...viewBaseline(), database: 'production' }), /Wrong isolated/);
  const changed = viewBaseline(); changed.readViews[0].options = ['security_invoker=true'];
  assert.throws(() => generatePermissionViewRepair(changed), /inventory\/options changed/);
  for (const b of groups.views.batches) for (const sql of [b.apply, b.rollback]) assert.equal(splitPostgresDump(sql).length, 1);
});

test('AI view gate retains active query, columns, ACL and trusted service/internal calls', () => {
  const b = generatePermissionViewRepair(viewBaseline()).batches[0];
  assert.match(b.apply, /CREATE OR REPLACE VIEW "public"\."ai_unified_config_view" WITH \(security_barrier=true\)/);
  assert.match(b.apply, /SELECT config\.\* FROM \(SELECT prompt FROM public\.ai_feature_config\) AS config/);
  assert.match(b.apply, /auth\.role\(\)=''service_role''/);
  assert.match(b.apply, /session_user=''fixture_database_owner''/);
  assert.match(b.apply, /public\.cloudbase_current_actor_active_v2\(\)/);
  assert.match(b.apply, /c\.oid='100'::oid/);
  assert.match(b.apply, /pg_attribute/);
  assert.match(b.apply, /c\.relacl::text\[\]/);
  assert.match(b.rollback, /RESET \(security_barrier\)/);
  assert.match(b.rollback, /COMMENT ON VIEW "public"\."ai_unified_config_view" IS NULL/);
  assert.doesNotMatch(`${b.apply}\n${b.rollback}`, /DROP VIEW|ALTER[^;]*OWNER|GRANT |REVOKE /);
});

test('statistics view supplement only revokes clients and exactly restores public SELECT', () => {
  const b = generatePermissionViewRepair(viewBaseline(), { allowStatisticsViewRevoke: true }).batches[1];
  assert.equal((b.apply.match(/EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE/g) ?? []).length, 2);
  assert.match(b.apply, /FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(b.apply, /REVOKE[^;]*FROM[^;]*service_role|CREATE OR REPLACE VIEW|ALTER VIEW|DROP VIEW/);
  assert.match(b.rollback, /GRANT SELECT ON TABLE "public"\."pg_stat_statements" TO PUBLIC/);
  assert.match(b.rollback, /GRANT SELECT ON TABLE "public"\."pg_stat_statements_info" TO PUBLIC/);
  assert.doesNotMatch(b.rollback, /GRANT[^;]*TO "authenticated"/);
});
