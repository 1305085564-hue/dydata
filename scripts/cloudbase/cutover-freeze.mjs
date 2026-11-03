import { createHash } from 'node:crypto';

const ROLES = ['PUBLIC', 'anon', 'authenticated', 'service_role'];
const PRIVILEGES = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'EXECUTE', 'USAGE']);
const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash('sha256').update(value).digest('hex');

// A dedicated operator connection holds these SHARE locks until handoff ends.
// They allow backup SELECTs but block INSERT/UPDATE/DELETE, including Auth
// changes and already-issued JWT/service-role paths. No data is changed.
// Never put this in a one-shot psql -c call: closing the connection releases it.
export function buildWriteLockSql(tableNames) {
  if (!Array.isArray(tableNames) || tableNames.length !== 99 || new Set(tableNames).size !== 99 || tableNames.some((name) => typeof name !== 'string' || !name || name.includes('\0'))) throw Error('Expected exact 99-table inventory');
  return `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL idle_in_transaction_session_timeout='15min';\nLOCK TABLE ${[...tableNames].sort().map((name) => `public.${identifier(name)}`).join(', ')}, auth.users IN SHARE MODE;\nSELECT 'DYDATA_SOURCE_WRITE_LOCK_HELD' AS receipt, pg_backend_pid() AS pid, clock_timestamp() AS acquired_at;\n-- KEEP THIS CONNECTION OPEN. Explicit ROLLBACK releases locks; there is no DML to commit.\n`;
}

// Run with the privileged read-only operator during the future authorized
// window. Includes column grants: table REVOKE alone does not remove them.
// The excluded variant drops objects owned by installed extensions (pg_depend
// deptype='e'): platform-owned extension members cannot be revoked by the
// source postgres role (owner is supabase_admin, no membership), and they are
// not business-data paths (internal-arg support functions or pure arithmetic),
// so the source freeze package must be built from that variant.
export function buildFreezeSnapshotSql({ excludeExtensionMembers = false } = {}) {
  const relationFilter = excludeExtensionMembers
    ? " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype='e')"
    : '';
  const functionFilter = excludeExtensionMembers
    ? " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e')"
    : '';
  return `WITH objects AS (
 SELECT 'table' kind, c.relname name, NULL::text args, NULL::text col,
        c.relacl acl, c.relowner owner, 'r'::"char" aclkind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')${relationFilter}
 UNION ALL
 SELECT 'column', c.relname, NULL, a.attname, a.attacl, c.relowner, 'c'::"char"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')${relationFilter}
 UNION ALL
 SELECT 'sequence', c.relname, NULL, NULL, c.relacl, c.relowner, 's'::"char"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'${relationFilter}
 UNION ALL
 SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid), NULL, p.proacl, p.proowner, 'f'::"char"
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'${functionFilter}
), rows AS (
 SELECT kind,name,args,col,pg_get_userbyid(owner) owner,
 coalesce((SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
 'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.privilege_type)
 FROM aclexplode(coalesce(acl,acldefault(aclkind,owner))) x
 WHERE x.grantee=0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role')), '[]'::jsonb) grants
 FROM objects
) SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY kind,name,coalesce(args,''),coalesce(col,'')),'[]'::jsonb) FROM rows;`;
}

export const FREEZE_SNAPSHOT_SQL = buildFreezeSnapshotSql();

function target(object) {
  if (!['table', 'column', 'sequence', 'function'].includes(object.kind) || typeof object.name !== 'string' || !object.name) throw Error('Invalid freeze object');
  const name = `public.${identifier(object.name)}`;
  if (object.kind === 'function') {
    // Args come exclusively from pg_get_function_identity_arguments, never UI.
    if (typeof object.args !== 'string' || /;|--|\/\*|\0/.test(object.args)) throw Error('Invalid function identity');
    return `FUNCTION ${name}(${object.args})`;
  }
  return `${object.kind === 'sequence' ? 'SEQUENCE' : 'TABLE'} ${name}`;
}

function revoke(object) {
  const roles = ROLES.map((role) => role === 'PUBLIC' ? role : identifier(role)).join(', ');
  return object.kind === 'column'
    ? `REVOKE SELECT (${identifier(object.col)}), INSERT (${identifier(object.col)}), UPDATE (${identifier(object.col)}), REFERENCES (${identifier(object.col)}) ON ${target(object)} FROM ${roles};`
    : `REVOKE ALL PRIVILEGES ON ${target(object)} FROM ${roles};`;
}

export const FREEZE_MAX_BYTES = 491_520;
export const FREEZE_MIN_HEADROOM = 1_500;
export function freezeRequestBudget(sql, channel, maxBytes = FREEZE_MAX_BYTES) {
  if (!['postgres', 'cloudbase'].includes(channel)) throw Error('Invalid freeze channel');
  if (!Number.isSafeInteger(maxBytes) || maxBytes > FREEZE_MAX_BYTES || maxBytes <= FREEZE_MIN_HEADROOM) throw Error('Invalid freeze budget');
  const sqlBytes = Buffer.byteLength(sql);
  const requestBytes = channel === 'postgres' ? sqlBytes : Buffer.byteLength(JSON.stringify({ EnvId: 'dydata-d6g0gd1v37fcddf21', Sql: sql }));
  return { channel, sqlBytes, requestBytes, headroomBytes: maxBytes - requestBytes, maxBytes };
}
export function freezeStateAt(snapshot, frontier) {
  if (!Number.isInteger(frontier) || frontier < 0 || frontier > snapshot.length) throw Error('Invalid freeze frontier');
  return snapshot.map((o, i) => ({ ...o, grants: i < frontier ? [] : o.grants }));
}
function grantsSql(object) {
  return object.grants.map(grant => {
    if (!ROLES.includes(grant.role) || !PRIVILEGES.has(grant.privilege) || typeof grant.grantable !== 'boolean') throw Error('Invalid original ACL');
    return `GRANT ${grant.privilege}${object.kind === 'column' ? ` (${identifier(object.col)})` : ''} ON ${target(object)} TO ${grant.role === 'PUBLIC' ? 'PUBLIC' : identifier(grant.role)}${grant.grantable ? ' WITH GRANT OPTION' : ''};`;
  });
}
// Each transaction carries the FULL baseline once. Derive both exact mixed
// states from its ordinality; no fields, object definitions or guards omitted.
function batchSql(input, start, end, action) {
  const before = action === 'freeze' ? start : end;
  const after = action === 'freeze' ? end : start;
  const window = `IF clock_timestamp()<${literal(input.opensAt)}::timestamptz OR clock_timestamp()>=${literal(input.closesAt)}::timestamptz THEN RAISE EXCEPTION 'Outside authorized freeze window'; END IF;`;
  const state = frontier => `SELECT jsonb_agg(CASE WHEN ord<=${frontier} THEN jsonb_set(v,'{grants}','[]'::jsonb) ELSE v END ORDER BY ord) INTO expected FROM jsonb_array_elements(baseline) WITH ORDINALITY q(v,ord);`;
  const read = `SELECT s INTO actual FROM (${buildFreezeSnapshotSql({excludeExtensionMembers:input.excludeExtensionMembers}).replace(/;\s*$/, '')}) q(s);`;
  const operations = input.snapshot.slice(start,end).flatMap(o => action === 'freeze' ? [revoke(o)] : grantsSql(o));
  const body = `DECLARE baseline jsonb := ${literal(JSON.stringify(input.snapshot))}::jsonb; actual jsonb; expected jsonb; BEGIN
${window}
${state(before)}
${read}
IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Freeze ACL baseline drift'; END IF;
${operations.join('\n')}
${state(after)}
${read}
IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Freeze ACL post-state drift'; END IF;
${window}
END`;
  let tag = `$freeze_${hash(body).slice(0,16)}$`;
  while (body.includes(tag)) tag = tag.slice(0,-1)+'x$';
  return `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='60s';\nSET LOCAL standard_conforming_strings=on;\nDO ${tag} ${body} ${tag};\nCOMMIT;\n`;
}
export function buildFreezePackage({ snapshot, project, opensAt, closesAt, excludeExtensionMembers = false, maxBytes = FREEZE_MAX_BYTES }) {
  if (typeof excludeExtensionMembers !== 'boolean' || !['gcrhhxaopomtposmahsw', 'dydata-d6g0gd1v37fcddf21'].includes(project) || !Array.isArray(snapshot) || !snapshot.length) throw Error('Wrong project or empty snapshot');
  const opens = Date.parse(opensAt), closes = Date.parse(closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens || closes-opens > 4*3600_000) throw Error('Invalid freeze window');
  const channel = project === 'gcrhhxaopomtposmahsw' ? 'postgres' : 'cloudbase';
  freezeRequestBudget('',channel,maxBytes);
  const seen = new Set();
  for (const object of snapshot) {
    const key = JSON.stringify([object.kind,object.name,object.args,object.col]);
    if (seen.has(key) || !Array.isArray(object.grants) || typeof object.owner !== 'string' || !object.owner || (object.kind === 'column' && (typeof object.col !== 'string' || !object.col || object.col.includes('\0')))) throw Error('Duplicate object or invalid grants');
    seen.add(key); target(object); grantsSql(object);
  }
  const input = { snapshot, opensAt:new Date(opens).toISOString(), closesAt:new Date(closes).toISOString(), excludeExtensionMembers };
  const make = (start,end,action) => {
    const sql = batchSql(input,start,end,action);
    return { action, start, end, sql, sha256:hash(sql), ...freezeRequestBudget(sql,channel,maxBytes) };
  };
  const fits = batch => batch.headroomBytes > FREEZE_MIN_HEADROOM;
  const applyBatches = [], rollbackBatches = [];
  let start = 0;
  while (start < snapshot.length) {
    let low = start+1, high = snapshot.length, best = null;
    while (low <= high) {
      const end = Math.floor((low+high)/2), apply = make(start,end,'freeze'), rollback = make(start,end,'rollback');
      if (fits(apply) && fits(rollback)) { best={apply,rollback}; low=end+1; } else high=end-1;
    }
    if (!best) throw Error('One freeze object with full guards exceeds request budget; do not remove fields');
    applyBatches.push(best.apply); rollbackBatches.unshift(best.rollback); start=best.apply.end;
  }
  const pkg = { version:2, project, channel, ...input, maxBytes, snapshotSha256:hash(JSON.stringify(snapshot)), objects:snapshot.length,
    snapshotSqlVariant:excludeExtensionMembers?'excluded':'full', applyBatches, rollbackBatches };
  return { ...pkg, packageSha256:hash(JSON.stringify(pkg)) };
}
export function verifyFreezePackage(pkg, expectedSha256) {
  if (pkg?.version !== 2) throw Error('Invalid freeze package');
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw Error('An external 64-hex SHA256 digest is required');
  }
  const { packageSha256, ...body } = pkg;
  if (packageSha256 !== expectedSha256 || hash(JSON.stringify(body)) !== packageSha256) throw Error('Freeze package digest mismatch');
  const rebuilt = buildFreezePackage(pkg);
  if (JSON.stringify(rebuilt) !== JSON.stringify(pkg)) throw Error('Freeze package definition mismatch');
  return pkg;
}
