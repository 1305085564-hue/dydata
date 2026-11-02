// Local-only rehearsal for a service-role-compatible get_leaderboard_rows candidate.
// Requires DYDATA_SUPABASE_LEADERBOARD_LAB_DIR to point to an approved empty lab.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { snapshotQuery as fullSchemaSnapshotQuery } from './permission-batch-a.mjs';

const targetSignature = 'public.get_leaderboard_rows(date)';
const labPrefix = /^\/(?:private\/)?tmp\/dydata-supabase-batch-a-rerun-/;
const records = [];
const actors = {};
const ids = { teams: [randomUUID(), randomUUID()], accounts: [], videos: [], reports: [] };
const runTag = randomUUID().slice(0, 8);
let stage = 'preflight';
let output;
let sql;
let http;
let original;
let originalFullMetadata;
let originalTableData;
let candidateDefinition;
let candidateSql;
let rollbackSql;
let serviceRoleKey;
let anonKey;
let apiUrl;
let cleanupErrors = [];
let cleanupDone = false;
let zeroRowsAssertion;

const nowTag = `${Date.now()}-${runTag}`;
const safeFile = (name, value) => {
  const contents = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path.join(output, name), contents, { mode: 0o600, flag: 'w' });
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const signatureSql = quote(targetSignature);
const publicTableDataSnapshotQuery = `SELECT jsonb_object_agg(name, digest) FROM (
  SELECT tablename AS name,
    query_to_xml(format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'')) AS digest FROM public.%I t', tablename), false, true, '')::text AS digest
  FROM pg_tables WHERE schemaname = 'public'
) s;`;
const dbContainer = (project) => `supabase_db_${project}`;
const loopback = new Set(['127.0.0.1', 'localhost', '::1']);

function queryFunctionSnapshot() {
  return `SELECT jsonb_build_object(
    'signature', format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)),
    'definition', pg_get_functiondef(p.oid),
    'definition_md5', md5(pg_get_functiondef(p.oid)),
    'owner', pg_get_userbyid(p.proowner),
    'acl', p.proacl::text,
    'config', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
    'security_definer', p.prosecdef,
    'argtypes', oidvectortypes(p.proargtypes),
    'returns', pg_get_function_result(p.oid),
    'grants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'role', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'grantor', pg_get_userbyid(a.grantor),
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ) ORDER BY u.ord, a.privilege_type)
      FROM unnest(coalesce(p.proacl, acldefault('f', p.proowner))) WITH ORDINALITY u(acl, ord)
      CROSS JOIN LATERAL aclexplode(ARRAY[u.acl]) a
    ), '[]'::jsonb)
  )::text
  FROM pg_proc p WHERE p.oid = ${signatureSql}::regprocedure;`;
}

function makePrecondition(snapshot, label) {
  const selectInto = queryFunctionSnapshot()
    .replace(/\)::text\s*\n\s*FROM pg_proc/, ')\n  INTO actual\n  FROM pg_proc')
    .replace(/;$/, '')
    .trim();
  return `DO $guard$ DECLARE actual jsonb; BEGIN
    ${selectInto};
    IF actual IS DISTINCT FROM ${quote(JSON.stringify(snapshot))}::jsonb THEN
      RAISE EXCEPTION '${label} metadata drift' USING ERRCODE = '55000';
    END IF;
  END $guard$;`;
}

function buildCandidateAndRollback(before) {
  const beforeDefinition = before.definition;
  const oldPredicate = 'WHERE auth.uid() IS NOT NULL';
  assert.equal(beforeDefinition.split(oldPredicate).length - 1, 1, 'Original guard must occur exactly once');
  candidateDefinition = beforeDefinition.replace(
    oldPredicate,
    "WHERE (auth.uid() IS NOT NULL OR auth.role() = 'service_role')",
  );
  assert.notEqual(candidateDefinition, beforeDefinition);
  assert.equal(
    candidateDefinition.replace("(auth.uid() IS NOT NULL OR auth.role() = 'service_role')", 'auth.uid() IS NOT NULL'),
    beforeDefinition,
    'Candidate must change only the identity guard',
  );

  candidateSql = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '3s';",
    "SET LOCAL statement_timeout = '30s';",
    makePrecondition(before, 'leaderboard original'),
    `${candidateDefinition.trimEnd()};`,
    `REVOKE ALL PRIVILEGES ON FUNCTION ${targetSignature} FROM PUBLIC, anon, authenticated, service_role;`,
    `GRANT EXECUTE ON FUNCTION ${targetSignature} TO service_role;`,
    'COMMIT;',
    '',
  ].join('\n');

  const grants = (before.grants || []).filter((g) => g.role !== before.owner);
  const grantsSql = grants.map((g) => {
    const grantee = g.role === 'PUBLIC' ? 'PUBLIC' : ident(g.role);
    return `GRANT ${g.privilege} ON FUNCTION ${targetSignature} TO ${grantee}${g.grantable ? ' WITH GRANT OPTION' : ''};`;
  });
  const candidateGuard = `DO $candidate_guard$ DECLARE f oid := ${signatureSql}::regprocedure; BEGIN
    IF pg_get_functiondef(f) IS DISTINCT FROM ${quote(candidateDefinition)}
      OR pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = f)) IS DISTINCT FROM ${quote(before.owner)}
      OR coalesce((SELECT to_jsonb(proconfig) FROM pg_proc WHERE oid = f), '[]'::jsonb) IS DISTINCT FROM ${quote(JSON.stringify(before.config))}::jsonb
      OR (SELECT prosecdef FROM pg_proc WHERE oid = f) IS DISTINCT FROM ${before.security_definer ? 'true' : 'false'}
      OR has_function_privilege('anon', f, 'EXECUTE')
      OR has_function_privilege('authenticated', f, 'EXECUTE')
      OR NOT has_function_privilege('service_role', f, 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = f AND a.grantee NOT IN (p.proowner, 'service_role'::regrole)
      )
      OR EXISTS (
        SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = f AND a.grantee = 'service_role'::regrole AND a.is_grantable
      ) THEN
      RAISE EXCEPTION 'leaderboard candidate metadata drift' USING ERRCODE = '55000';
    END IF;
  END $candidate_guard$;`;
  rollbackSql = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '3s';",
    "SET LOCAL statement_timeout = '30s';",
    candidateGuard,
    `${beforeDefinition.trimEnd()};`,
    `REVOKE ALL PRIVILEGES ON FUNCTION ${targetSignature} FROM PUBLIC, anon, authenticated, service_role;`,
    ...grantsSql,
    'COMMIT;',
    '',
  ].join('\n');
}

function runSql(name, text) {
  safeFile(`${name}.sql`, text);
  try {
    sql(text);
    records.push({ stage, name, status: 'PASS' });
  } catch (error) {
    safeFile(`${name}.error.json`, { message: String(error.stderr || error.message) });
    records.push({ stage, name, status: 'FAIL', message: String(error.stderr || error.message) });
    throw error;
  }
  safeFile('requests-and-assertions.json', records);
}

function ok(response, label) {
  assert(response.ok, `${label}: HTTP ${response.status} ${response.data?.code || ''} ${response.data?.message || ''}`);
  return response.data;
}

function decodedClaims(token) {
  const [, payload] = token.split('.');
  assert(payload, 'Expected a JWT from the local Supabase Auth service');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

async function signIn(actorName, email, password) {
  const response = await fetch(new URL('/auth/v1/token?grant_type=password', apiUrl), {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  records.push({ stage, actor: actorName, method: 'POST', path: '/auth/v1/token?grant_type=password', status: response.status, ...(data.code ? { code: data.code } : {}) });
  assert.equal(response.status, 200, `${actorName} local Auth login failed`);
  assert.equal(typeof data.access_token, 'string');
  actors[actorName].token = data.access_token;
  const claims = decodedClaims(data.access_token);
  assert.equal(claims.role, 'authenticated');
  assert.equal(claims.sub, actors[actorName].id);
  const verified = ok(await http(actorName, '/auth/v1/user'), `${actorName} token verification`);
  assert.equal(verified.id, actors[actorName].id);
}

async function makeIdentity(name, teamId) {
  const email = `leaderboard-${runTag}-${name}@example.test`;
  const password = `${randomBytes(24).toString('base64url')}Aa1!`;
  const created = ok(await http('service', '/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { full_name: `Synthetic ${name}` } },
  }), `create synthetic Auth user ${name}`);
  actors[name] = { id: created.id, email, teamId };
  sql(`INSERT INTO public.profiles(id, name, role, status, permissions, team_id, membership_status, data_scope, company_role)
       VALUES (${quote(created.id)}::uuid, ${quote(`Synthetic ${name}`)}, 'member', 'active', '{}'::jsonb,
               ${quote(teamId)}::uuid, 'active', 'self', 'member')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, status = EXCLUDED.status,
         permissions = EXCLUDED.permissions, team_id = EXCLUDED.team_id,
         membership_status = EXCLUDED.membership_status, data_scope = EXCLUDED.data_scope,
         company_role = EXCLUDED.company_role`);
  await signIn(name, email, password);
}

function assertDenied(response, label) {
  assert([401, 403].includes(response.status), `${label} must be rejected; got ${response.status}`);
  assert(!response.ok, `${label} unexpectedly succeeded`);
}

async function createFixture() {
  sql(`INSERT INTO public.teams(id, name) VALUES
    (${quote(ids.teams[0])}::uuid, ${quote(`Synthetic leaderboard A ${runTag}`)}),
    (${quote(ids.teams[1])}::uuid, ${quote(`Synthetic leaderboard B ${runTag}`)})`);
  await makeIdentity('memberA', ids.teams[0]);
  await makeIdentity('memberB', ids.teams[1]);

  ids.accounts = [randomUUID(), randomUUID()];
  sql(`INSERT INTO public.accounts(id, profile_id, name, content_direction, presentation_format)
    VALUES (${quote(ids.accounts[0])}::uuid, ${quote(actors.memberA.id)}::uuid, ${quote(`Synthetic leaderboard A ${runTag}`)}, 'synthetic', 'short'),
           (${quote(ids.accounts[1])}::uuid, ${quote(actors.memberB.id)}::uuid, ${quote(`Synthetic leaderboard B ${runTag}`)}, 'synthetic', 'short')`);

  ids.videos = [randomUUID(), randomUUID()];
  sql(`INSERT INTO public.videos(id, account_id, user_id, video_title, published_at, anomaly_status, lifecycle_state, review_status)
    VALUES (${quote(ids.videos[0])}::uuid, ${quote(ids.accounts[0])}::uuid, ${quote(actors.memberA.id)}::uuid,
            'Synthetic publication-in-window', '2026-11-01T05:00:00Z', 'normal', 'active', 'reviewed'),
           (${quote(ids.videos[1])}::uuid, ${quote(ids.accounts[1])}::uuid, ${quote(actors.memberB.id)}::uuid,
            'Synthetic publication-outside-window', '2026-10-02T05:00:00Z', 'normal', 'active', 'reviewed')`);

  ids.reports = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  sql(`INSERT INTO public.daily_reports(id, user_id, account_id, report_date, title, submitter, play_count, likes, video_id, is_void)
    VALUES
      (${quote(ids.reports[0])}::uuid, ${quote(actors.memberA.id)}::uuid, ${quote(ids.accounts[0])}::uuid, '2026-10-05', 'Synthetic published-date inclusion', 'Synthetic member A', 101, 11, ${quote(ids.videos[0])}::uuid, false),
      (${quote(ids.reports[1])}::uuid, ${quote(actors.memberA.id)}::uuid, ${quote(ids.accounts[0])}::uuid, '2026-11-02', 'Synthetic report-date fallback', 'Synthetic member A', 202, 22, NULL, false),
      (${quote(ids.reports[2])}::uuid, ${quote(actors.memberB.id)}::uuid, ${quote(ids.accounts[1])}::uuid, '2026-11-01', 'Synthetic in-range report date', 'Synthetic member B', 303, 33, NULL, false),
      (${quote(ids.reports[3])}::uuid, ${quote(actors.memberB.id)}::uuid, ${quote(ids.accounts[1])}::uuid, '2026-10-01', 'Synthetic outside both dates', 'Synthetic member B', 404, 44, ${quote(ids.videos[1])}::uuid, false),
      (${quote(ids.reports[4])}::uuid, ${quote(actors.memberB.id)}::uuid, ${quote(ids.accounts[1])}::uuid, '2026-11-01', 'Synthetic void report', 'Synthetic member B', 505, 55, NULL, true)`);

  safeFile('synthetic-fixture.private.json', {
    runTag,
    identities: Object.fromEntries(Object.entries(actors).map(([name, value]) => [name, { id: value.id, email: value.email, teamId: value.teamId }])),
    teams: ids.teams,
    accounts: ids.accounts,
    videos: ids.videos,
    reports: ids.reports,
    credentialsSaved: false,
  });
}

function assertExpectedRows(rows) {
  assert.equal(rows.length, 3, 'Expected only the two in-range reports plus the publication-date inclusion');
  assert.deepEqual([...rows.map((row) => row.play_count)].sort((a, b) => a - b), [101, 202, 303]);
  const published = rows.find((row) => row.play_count === 101);
  const fallback = rows.find((row) => row.play_count === 202);
  assert.equal(published.report_date, '2026-11-01', 'Publication date must include a report whose report_date is outside the range');
  assert.equal(fallback.report_date, '2026-11-02', 'Missing video publication must fall back to report_date');
  assert.equal(rows.some((row) => row.play_count === 404), false, 'A report outside both date paths must be excluded');
  assert.equal(rows.some((row) => row.play_count === 505), false, 'A void report must be excluded');
}

async function cleanup() {
  stage = 'cleanup';
  cleanupErrors = [];
  if (original && candidateDefinition && rollbackSql) {
    try {
      const current = sql(queryFunctionSnapshot());
      const snapshot = JSON.parse(current);
      if (JSON.stringify(snapshot) !== JSON.stringify(original)) {
        const isCandidate = snapshot.definition === candidateDefinition
          && snapshot.owner === original.owner
          && JSON.stringify(snapshot.config) === JSON.stringify(original.config)
          && snapshot.security_definer === original.security_definer;
        assert(isCandidate, 'Refusing to overwrite unexpected get_leaderboard_rows state during cleanup');
        runSql('leaderboard-exact-rollback', rollbackSql);
      }
      assert.deepEqual(JSON.parse(sql(queryFunctionSnapshot())), original, 'Original function metadata must be restored before data cleanup');
    } catch (error) {
      cleanupErrors.push(`function restore: ${error.message}`);
    }
  }

  for (const [name, actor] of Object.entries(actors)) {
    if (!actor.token) continue;
    try {
      const response = await http(name, '/auth/v1/logout', { method: 'POST' });
      if (![200, 204].includes(response.status)) cleanupErrors.push(`sign out ${name}: HTTP ${response.status}`);
    } catch (error) {
      cleanupErrors.push(`sign out ${name}: ${error.message}`);
    }
  }

  try {
    const reportIds = ids.reports.map((id) => `${quote(id)}::uuid`).join(',') || "'00000000-0000-0000-0000-000000000000'::uuid";
    const videoIds = ids.videos.map((id) => `${quote(id)}::uuid`).join(',') || "'00000000-0000-0000-0000-000000000000'::uuid";
    const accountIds = ids.accounts.map((id) => `${quote(id)}::uuid`).join(',') || "'00000000-0000-0000-0000-000000000000'::uuid";
    const profileIds = Object.values(actors).map((actor) => `${quote(actor.id)}::uuid`).join(',') || "'00000000-0000-0000-0000-000000000000'::uuid";
    const teamIds = ids.teams.map((id) => `${quote(id)}::uuid`).join(',');
    sql(`BEGIN;
      DELETE FROM public.daily_reports WHERE id IN (${reportIds});
      DELETE FROM public.videos WHERE id IN (${videoIds});
      DELETE FROM public.accounts WHERE id IN (${accountIds});
      DELETE FROM public.profiles WHERE id IN (${profileIds});
      DELETE FROM public.teams WHERE id IN (${teamIds});
      COMMIT;`);
  } catch (error) {
    cleanupErrors.push(`synthetic business rows: ${String(error.stderr || error.message)}`);
  }

  for (const actor of Object.values(actors)) {
    try {
      if (sql(`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = ${quote(actor.id)}::uuid)`) !== 't') continue;
      const response = await http('service', `/auth/v1/admin/users/${actor.id}`, { method: 'DELETE' });
      if (!response.ok) cleanupErrors.push(`delete synthetic Auth user ${actor.id}: HTTP ${response.status}`);
    } catch (error) {
      cleanupErrors.push(`delete synthetic Auth user ${actor.id}: ${error.message}`);
    }
  }
}

async function main() {
  const requestedDir = process.env.DYDATA_SUPABASE_LEADERBOARD_LAB_DIR;
  assert(requestedDir, 'Set DYDATA_SUPABASE_LEADERBOARD_LAB_DIR to the approved isolated local lab');
  const directory = realpathSync(requestedDir);
  assert(labPrefix.test(directory), 'Refusing a lab outside the approved /tmp/dydata-supabase-batch-a-rerun-* prefix');
  assert.match(directory, /^\/(?:private\/)?tmp\/dydata-supabase-batch-a-rerun-[0-9]{8}$/);
  const config = readFileSync(path.join(directory, 'supabase/config.toml'), 'utf8');
  const project = config.match(/^project_id = "([^"]+)"/m)?.[1];
  assert.match(project || '', /^dydata-supabase-batch-a-rerun-[0-9]{8}$/);
  assert.equal(path.basename(directory), project, 'Lab basename must match Supabase project_id');
  const receipt = JSON.parse(readFileSync(path.join(directory, 'bootstrap-receipt.json'), 'utf8'));
  assert.equal(receipt.project, project, 'Bootstrap receipt project mismatch');
  assert.equal(realpathSync(receipt.directory), directory, 'Bootstrap receipt directory mismatch');
  assert.equal(receipt.productionAccessed, false, 'Lab receipt indicates remote access');
  assert.equal(receipt.productionDataImported, false, 'Lab receipt indicates imported production data');
  assert.equal(receipt.counts?.tables, 99, 'Expected the isolated 99-table lab');

  const statusText = execFileSync('/opt/homebrew/bin/supabase', ['status', '--workdir', directory, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const status = JSON.parse(statusText);
  apiUrl = new URL(status.API_URL);
  assert.equal(apiUrl.protocol, 'http:');
  assert(loopback.has(apiUrl.hostname), 'Local loopback API only');
  assert(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'Local Supabase Auth credentials missing');
  anonKey = status.ANON_KEY;
  serviceRoleKey = status.SERVICE_ROLE_KEY;
  const serviceClaims = decodedClaims(serviceRoleKey);
  assert.equal(serviceClaims.role, 'service_role', 'Expected the local Supabase service-role JWT');

  const outputBase = path.join(directory, `leaderboard-compat-evidence-${nowTag}`);
  mkdirSync(outputBase, { mode: 0o700 });
  output = outputBase;
  const container = dbContainer(project);
  sql = (statement) => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-XAtq'], {
    input: statement,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  http = async (actor, route, { method = 'GET', body, prefer } = {}) => {
    const token = actor === 'service' ? serviceRoleKey : actor === 'anon' ? null : actors[actor]?.token;
    assert(actor === 'anon' || token, `Missing verified local credential for ${actor}`);
    const key = actor === 'service' ? serviceRoleKey : anonKey;
    const response = await fetch(new URL(route, apiUrl), {
      method,
      headers: {
        apikey: key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    const record = { stage, actor, method, path: route, status: response.status };
    if (data && typeof data === 'object') {
      if (data.code) record.code = data.code;
      if (data.message) record.message = data.message;
    }
    records.push(record);
    safeFile('requests-and-assertions.json', records);
    return { status: response.status, ok: response.ok, data };
  };
  const rpc = (actor, body) => http(actor, '/rest/v1/rpc/get_leaderboard_rows', { method: 'POST', body });
  const snapshot = () => JSON.parse(sql(queryFunctionSnapshot()));

  zeroRowsAssertion = `DO $empty$ DECLARE r record; n bigint; BEGIN
    IF (SELECT count(*) FROM auth.users) <> 0 OR (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 99 THEN
      RAISE EXCEPTION 'Expected an empty 99-table isolated lab with zero Auth users';
    END IF;
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Refusing nonempty lab table: %', r.tablename; END IF;
    END LOOP;
  END $empty$;`;
  sql(zeroRowsAssertion);
  const baseline = snapshot();
  originalFullMetadata = JSON.parse(sql(fullSchemaSnapshotQuery));
  originalTableData = JSON.parse(sql(publicTableDataSnapshotQuery));
  safeFile('full-original-metadata.private.json', originalFullMetadata);
  safeFile('full-original-public-table-digests.private.json', originalTableData);
  assert.equal(baseline.signature.replaceAll(', ', ','), targetSignature);
  assert.equal(baseline.owner, 'postgres');
  assert.equal(baseline.security_definer, true);
  assert.deepEqual(baseline.config, ['search_path=public']);
  assert.match(baseline.definition, /WHERE auth\.uid\(\) IS NOT NULL/);
  assert.match(baseline.definition, /coalesce\(dr\.is_void, false\) = false/);
  assert.match(baseline.definition, /coalesce\(\(v\.published_at at time zone 'Asia\/Shanghai'\)::date, dr\.report_date\)/);
  assert(baseline.grants.some((g) => g.role === 'authenticated' && g.privilege === 'EXECUTE'));
  assert(baseline.grants.some((g) => g.role === 'service_role' && g.privilege === 'EXECUTE'));
  assert(baseline.grants.every((g) => [baseline.owner, 'PUBLIC', 'anon', 'authenticated', 'service_role'].includes(g.role)), 'Unexpected original ACL grantee');
  original = baseline;
  safeFile('original-function.private.json', baseline);
  safeFile('preflight.json', {
    project,
    apiOrigin: apiUrl.origin,
    productionAccessed: false,
    publicTableCount: 99,
    publicTablesInitiallyEmpty: true,
    authUsersInitially: 0,
    serviceJwtRole: serviceClaims.role,
    serviceJwtSubjectPresent: typeof serviceClaims.sub === 'string' && serviceClaims.sub.length > 0,
  });

  stage = 'synthetic-data';
  await createFixture();
  const originalServiceRows = ok(await rpc('service', { since_date: '2026-11-01' }), 'original service-role RPC');
  const memberARows = ok(await rpc('memberA', { since_date: '2026-11-01' }), 'original member A RPC');
  const memberBRows = ok(await rpc('memberB', { since_date: '2026-11-01' }), 'original member B RPC');
  assertExpectedRows(memberARows);
  assertExpectedRows(memberBRows);
  assert.deepEqual(memberARows, memberBRows, 'Original function must return the same complete statistics for both authenticated JWTs');
  if (!serviceClaims.sub) assert.deepEqual(originalServiceRows, [], 'Without an auth.uid subject, original service-role call should be empty');
  safeFile('original-rpc-results.private.json', {
    serviceRoleRows: originalServiceRows,
    memberARows,
    memberBRows,
    memberRowsNonempty: memberARows.length > 0,
    originalServiceRowsEmpty: originalServiceRows.length === 0,
    comparison: 'Synthetic raw RPC results only; route visibility filtering is a separate existing helper test.',
  });
  records.push({ stage, name: 'original auth JWTs return expected nonempty rows and preserve date/void/fallback behavior', status: 'PASS', rows: memberARows.length });
  records.push({ stage, name: 'original service-role result recorded before candidate', status: 'PASS', rows: originalServiceRows.length, serviceSubjectPresent: Boolean(serviceClaims.sub) });

  buildCandidateAndRollback(baseline);
  safeFile('candidate.sql', candidateSql);
  safeFile('exact-rollback.sql', rollbackSql);
  stage = 'candidate-installed';
  runSql('leaderboard-candidate', candidateSql);
  const candidateSnapshot = snapshot();
  assert.equal(candidateSnapshot.definition, candidateDefinition);
  assert.equal(candidateSnapshot.owner, baseline.owner);
  assert.deepEqual(candidateSnapshot.config, baseline.config);
  assert.equal(candidateSnapshot.security_definer, baseline.security_definer);
  assert.equal(candidateSnapshot.grants.some((g) => g.role === 'authenticated' && g.privilege === 'EXECUTE'), false);
  assert.equal(candidateSnapshot.grants.some((g) => g.role === 'anon' && g.privilege === 'EXECUTE'), false);
  assert.equal(candidateSnapshot.grants.some((g) => g.role === 'PUBLIC' && g.privilege === 'EXECUTE'), false);
  assert.equal(candidateSnapshot.grants.some((g) => g.role === 'service_role' && g.privilege === 'EXECUTE'), true);
  safeFile('candidate-function.private.json', candidateSnapshot);

  const serviceRows = ok(await rpc('service', { since_date: '2026-11-01' }), 'candidate service-role RPC');
  assertExpectedRows(serviceRows);
  assert.deepEqual(serviceRows, memberARows, 'Candidate service-role results must exactly match original user-JWT statistics');
  for (const actor of ['memberA', 'memberB', 'anon']) {
    const denied = await rpc(actor, { since_date: '2026-11-01' });
    assertDenied(denied, `${actor} candidate RPC`);
  }
  records.push({ stage, name: 'service-role JWT receives nonempty statistics identical to original user JWT', status: 'PASS', rows: serviceRows.length });
  records.push({ stage, name: 'authenticated and anonymous JWTs cannot execute service-only candidate', status: 'PASS' });
  safeFile('candidate-rpc-results.private.json', { serviceRows, matchedOriginalMemberRowsExactly: true });

  stage = 'rollback';
  runSql('leaderboard-exact-rollback', rollbackSql);
  assert.deepEqual(snapshot(), baseline, 'Function definition, ACL, owner and search_path must match original exactly');
  records.push({ stage, name: 'exact function metadata restoration', status: 'PASS' });

  await cleanup();
  cleanupDone = cleanupErrors.length === 0;
  assert.deepEqual(cleanupErrors, [], `Cleanup incomplete: ${cleanupErrors.join('; ')}`);
  assert.equal(sql('SELECT count(*) FROM auth.users'), '0', 'Synthetic Auth users must be fully removed');
  sql(zeroRowsAssertion);
  assert.deepEqual(snapshot(), baseline, 'Original function definition, ACL and path must remain exact after cleanup');
  const finalFullMetadata = JSON.parse(sql(fullSchemaSnapshotQuery));
  const finalTableData = JSON.parse(sql(publicTableDataSnapshotQuery));
  assert.deepEqual(finalFullMetadata, originalFullMetadata, 'Full audited function/dependency/policy/schema snapshot must match before and after');
  assert.deepEqual(finalTableData, originalTableData, 'All 99 public table row digests must match before and after');
  safeFile('full-final-metadata.private.json', finalFullMetadata);
  safeFile('full-final-public-table-digests.private.json', finalTableData);
  records.push({ stage: 'post-cleanup', name: 'Auth 0, all 99 public tables empty, original RPC metadata exact', status: 'PASS' });
  safeFile('requests-and-assertions.json', records);
  safeFile('summary.json', {
    status: 'PASS',
    project,
    apiOrigin: apiUrl.origin,
    output,
    productionAccessed: false,
    productionDataImported: false,
    syntheticAuthUsersCreated: 2,
    syntheticAuthUsersRemaining: 0,
    syntheticTeamsCreated: 2,
    syntheticAccountsCreated: 2,
    syntheticReportsCreated: 5,
    originalRows: memberARows.length,
    serviceRows: serviceRows.length,
    originalServiceRows: originalServiceRows.length,
    exactRollback: true,
    fullSchemaSnapshotRestored: true,
    allPublicTableRowDigestsRestored: true,
    routeVisibilityFilteringVerifiedSeparately: false,
  });
  console.log(JSON.stringify({ status: 'PASS', output, assertions: records.length, candidateRows: serviceRows.length, originalServiceRows: originalServiceRows.length }));
}

try {
  await main();
} catch (error) {
  records.push({ stage, name: 'run', status: 'FAIL', message: error.message });
  if (output) {
    try { safeFile('failure.json', { stage, message: error.message, stack: error.stack }); } catch {}
  }
  console.error(JSON.stringify({ status: 'FAIL', stage, output, message: error.message }));
  process.exitCode = 1;
} finally {
  if (output && original && !cleanupDone) {
    try {
      await cleanup();
      cleanupDone = cleanupErrors.length === 0;
      if (!cleanupDone) {
        safeFile('cleanup-errors.json', cleanupErrors);
        process.exitCode = 1;
      }
      if (zeroRowsAssertion) {
        sql(zeroRowsAssertion);
        assert.equal(sql('SELECT count(*) FROM auth.users'), '0');
        assert.deepEqual(JSON.parse(sql(queryFunctionSnapshot())), original);
        if (originalFullMetadata) assert.deepEqual(JSON.parse(sql(fullSchemaSnapshotQuery)), originalFullMetadata);
        if (originalTableData) assert.deepEqual(JSON.parse(sql(publicTableDataSnapshotQuery)), originalTableData);
      }
      safeFile('requests-and-assertions.json', records);
    } catch (error) {
      cleanupErrors.push(error.message);
      try { safeFile('cleanup-errors.json', cleanupErrors); } catch {}
      process.exitCode = 1;
    }
  }
  serviceRoleKey = undefined;
  anonKey = undefined;
  for (const actor of Object.values(actors)) actor.token = undefined;
}
