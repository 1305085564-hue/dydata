import { createHash } from 'node:crypto';
import { packSqlBatches } from './sql-batches.mjs';
import { buildSnapshotAssertionSql, quoteIdentifier as qi, quoteLiteral as ql } from './cutover-core.mjs';
import { buildAuthImportPlan, AUTH_IMPORT_ENV_ID } from './auth-import.mjs';

// Offline only. Small immutable staging batches followed by ONE guarded
// promotion transaction. This module has no executor or network capability.
export const CUTOVER_TARGET_METADATA_SQL = `SELECT jsonb_build_object(
 'externalIncomingForeignKeys',(SELECT count(*) FROM pg_constraint k JOIN pg_class parent ON parent.oid=k.confrelid JOIN pg_class child ON child.oid=k.conrelid WHERE k.contype='f' AND parent.relnamespace='public'::regnamespace AND child.relnamespace<>'public'::regnamespace),
 'foreignKeys',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f'),'[]'::jsonb),
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled) ORDER BY c.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),'[]'::jsonb)
);`;
// Normalize timestamptz representation without relying on cross-request session
// settings. Keep microseconds and bigint IDs; only login activity is excluded.
export const CUTOVER_AUTH_BASELINE_SQL = `SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(j.key,
 CASE WHEN a.atttypid='timestamptz'::regtype AND j.value<>'null'::jsonb
 THEN to_jsonb(to_char((j.value#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ELSE j.value END)
 FROM jsonb_each((to_jsonb(u)-'last_login')||jsonb_build_object('id',u.id::text)) j
 LEFT JOIN pg_attribute a ON a.attrelid='auth.users'::regclass AND a.attname=j.key AND a.attnum>0) ORDER BY u.id),'[]'::jsonb) FROM auth.users u;`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const scoped = (name, schema = 'public') => `${qi(schema)}.${qi(name)}`;
function assertJsonSql(query, expected, label) {
  const body = `DECLARE actual jsonb; BEGIN SELECT v INTO actual FROM (${query.replace(/;\s*$/, '')}) q(v); IF actual IS DISTINCT FROM ${ql(JSON.stringify(expected))}::jsonb THEN RAISE EXCEPTION ${ql(label)}; END IF; END`;
  let suffix = digest(body).slice(0, 16), tag = `$cutover_guard_${suffix}$`;
  while (body.includes(tag)) { suffix += 'x'; tag = `$cutover_guard_${suffix}$`; }
  return `DO ${tag} ${body} ${tag};`;
}
function authStatements({ sourceAuth, targetAuth, capturedAt }) {
  const plan = buildAuthImportPlan({ sourceUsers: sourceAuth, targetIdentities: [], capturedAt, project: AUTH_IMPORT_ENV_ID });
  const expected = plan.batches.flatMap((batch) => batch.expectedRows);
  const columns = ['username', 'email', 'password', 'status', 'email_verified'];
  const value = (x) => typeof x === 'boolean' || typeof x === 'number' ? String(x) : ql(x);
  if (!Array.isArray(targetAuth) || targetAuth.length < expected.length) throw Error('Missing fresh target Auth baseline');
  const after = structuredClone(targetAuth);
  const updates = expected.map((row) => {
    const matches = after.filter((user) => user.sub === row.sub);
    if (matches.length !== 1 || matches[0].project !== AUTH_IMPORT_ENV_ID) throw Error('Source UUID missing or ambiguous in target Auth');
    const identity = matches[0];
    for (const key of columns) identity[key] = row[key];
    return `UPDATE auth.users SET ${columns.map((key) => `${qi(key)}=${value(row[key])}`).join(', ')} WHERE id=${ql(String(identity.id))}::bigint AND sub=${ql(row.sub)} AND project=${ql(AUTH_IMPORT_ENV_ID)};`;
  });
  return { statements: [assertJsonSql(CUTOVER_AUTH_BASELINE_SQL, targetAuth, 'Target Auth baseline drift'), ...updates,
    assertJsonSql(CUTOVER_AUTH_BASELINE_SQL, after, 'Target Auth mirror mismatch')], summary: { mirrored: expected.length, preservedExtra: targetAuth.length - expected.length } };
}

export function buildCloudBaseCutoverPackage({ parsed, baselineMetrics, latestMetrics, targetMetadata, sourceAuth, targetAuth,
  capturedAt, runId, opensAt, closesAt, maxBytes = 480 * 1024 }) {
  if (!/^[a-f0-9]{16}$/.test(runId ?? '')) throw Error('Use a new immutable 16-hex run ID');
  if (parsed.tables.length !== 99 || new Set(parsed.tables.map((t) => t.name)).size !== 99) throw Error('Expected 99 source public tables');
  const opens = Date.parse(opensAt), closes = Date.parse(closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens || closes - opens > 4 * 3600_000) throw Error('Invalid authorized cutover window');
  const schema = `dydata_cutover_${runId}`;
  const windowGuard = `DO $window$ BEGIN IF clock_timestamp()<${ql(new Date(opens).toISOString())}::timestamptz OR clock_timestamp()>${ql(new Date(closes).toISOString())}::timestamptz THEN RAISE EXCEPTION 'Outside authorized cutover window'; END IF; END $window$;`;
  const names = new Set(parsed.tables.map((t) => t.name));
  if (!Array.isArray(targetMetadata?.foreignKeys) || !Array.isArray(targetMetadata?.triggers) || targetMetadata.externalIncomingForeignKeys !== 0) throw Error('Missing metadata or external incoming foreign keys');
  for (const fk of targetMetadata.foreignKeys) {
    if (!names.has(fk.table) || typeof fk.definition !== 'string' || !/^FOREIGN KEY\s/.test(fk.definition) || /;|--|\/\*|\0/.test(fk.definition)) throw Error('Unsupported target foreign key');
  }
  const restoreTriggers = targetMetadata.triggers.map((trigger) => {
    const state = { O: 'ENABLE', D: 'DISABLE', R: 'ENABLE REPLICA', A: 'ENABLE ALWAYS' }[trigger.enabled];
    if (!names.has(trigger.table) || !state || typeof trigger.name !== 'string') throw Error('Unsupported target trigger');
    return `ALTER TABLE ${scoped(trigger.table)} ${state} TRIGGER ${qi(trigger.name)};`;
  });
  const setup = [`CREATE SCHEMA ${qi(schema)};`, `REVOKE ALL ON SCHEMA ${qi(schema)} FROM PUBLIC, anon, authenticated, service_role;`,
    ...parsed.tables.map((table) => `CREATE TABLE ${scoped(table.name, schema)} (LIKE ${scoped(table.name)} INCLUDING GENERATED);`)];
  const stageRows = parsed.statements.map((statement) => {
    if (!/^INSERT INTO public\./.test(statement)) throw Error('Expected archive COPY converter INSERT');
    return statement.replace(/^INSERT INTO public\./, `INSERT INTO ${qi(schema)}.`);
  });
  const stage = packSqlBatches([...setup, ...stageRows], { maxBytes: maxBytes - 2048, migrationId: `cutover-stage-${runId}` })
    .map((batch) => {
      const sql = `SET LOCAL statement_timeout='60s';\nSET LOCAL timezone='UTC';\nSET LOCAL standard_conforming_strings=on;\n${windowGuard}\n${batch.sql}\n${windowGuard}`;
      return { ...batch, sql, sha256: digest(sql), bytes: Buffer.byteLength(sql) };
    });
  const auth = authStatements({ sourceAuth, targetAuth, capturedAt });
  const final = [
    "SET LOCAL lock_timeout='3s';", "SET LOCAL statement_timeout='60s';", "SET LOCAL timezone='UTC';", "SET LOCAL standard_conforming_strings=on;",
    windowGuard,
    `LOCK TABLE ${parsed.tables.map((table) => scoped(table.name)).join(', ')}, auth.users IN ACCESS EXCLUSIVE MODE;`,
    assertJsonSql(CUTOVER_TARGET_METADATA_SQL, targetMetadata, 'Target FK/trigger drift'),
    buildSnapshotAssertionSql(baselineMetrics, parsed.tables, 'target_baseline'),
    buildSnapshotAssertionSql(latestMetrics, parsed.tables, 'staged_latest').replaceAll('FROM public.', `FROM ${qi(schema)}.`),
    ...parsed.tables.map((table) => `ALTER TABLE ${scoped(table.name)} DISABLE TRIGGER USER;`),
    ...targetMetadata.foreignKeys.map((fk) => `ALTER TABLE ${scoped(fk.table)} DROP CONSTRAINT ${qi(fk.name)};`),
    ...parsed.tables.map((table) => `DELETE FROM ${scoped(table.name)};`),
    ...parsed.tables.map((table) => {
      const columns = table.columns.map(qi).join(', ');
      return `INSERT INTO ${scoped(table.name)} (${columns}) OVERRIDING SYSTEM VALUE SELECT ${columns} FROM ${scoped(table.name, schema)};`;
    }),
    ...targetMetadata.foreignKeys.map((fk) => `ALTER TABLE ${scoped(fk.table)} ADD CONSTRAINT ${qi(fk.name)} ${fk.definition};`),
    ...restoreTriggers, ...auth.statements,
    buildSnapshotAssertionSql(latestMetrics, parsed.tables, 'promoted_latest'),
    assertJsonSql(CUTOVER_TARGET_METADATA_SQL, targetMetadata, 'Target FK/trigger restoration mismatch'),
    windowGuard,
  ].join('\n');
  if (Buffer.byteLength(final) > maxBytes) throw Error('Atomic promotion exceeds batch budget; cannot split across requests');
  return { environmentId: AUTH_IMPORT_ENV_ID, runId, schema, opensAt, closesAt, strategy: 'full final-snapshot replacement through private staging; NOT timestamp-only delta',
    stageBatches: stage, finalBatch: { id: `cutover-promote-${runId}`, sql: final, sha256: digest(final), bytes: Buffer.byteLength(final) },
    // setval is NOT transactional in PostgreSQL. Keep it out of the promotion
    // so a rollback cannot falsely claim sequence changes were rolled back.
    sequenceBatches: packSqlBatches(parsed.sequenceStatements.map((statement) => {
      const match = /^SELECT\s+pg_catalog\.setval\('((?:[^']|'')+)',\s*(\d+),\s*(true|false)\);$/i.exec(statement);
      const name = match && /^public\.([A-Za-z_][\w$]*|"(?:[^"]|"")+")$/.exec(match[1].replaceAll("''", "'"));
      if (!match || !name) throw Error('Unsupported sequence statement');
      const sequence = scoped(name[1].startsWith('"') ? name[1].slice(1, -1).replaceAll('""', '"') : name[1]);
      return `SELECT pg_catalog.setval(${ql(sequence)}, GREATEST(${BigInt(match[2])},(SELECT last_value FROM ${sequence})), ${match[3]} OR (SELECT is_called FROM ${sequence}));`;
    }), { maxBytes: maxBytes - 2048, migrationId: `cutover-sequences-${runId}` }).map((batch) => {
      const sql = `${windowGuard}\n${batch.sql}\n${windowGuard}`;
      return { ...batch, sql, sha256: digest(sql), bytes: Buffer.byteLength(sql) };
    }),
    authSummary: auth.summary, sourceTableCount: 99, finalAtomic: true,
    prerequisites: ['fresh exact target baseline and complete FK/trigger metadata', 'external incoming FKs absent', 'source/target maintenance and write locks', 'authorize exact replacement/deletion inventory and Auth mirror', 'runBatches ledger plus ExecutePGSql owner permissions', 'window approval; package generation is not authorization'] };
}
