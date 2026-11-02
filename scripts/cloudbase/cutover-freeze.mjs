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
export const FREEZE_SNAPSHOT_SQL = `WITH objects AS (
 SELECT 'table' kind, c.relname name, NULL::text args, NULL::text col,
        c.relacl acl, c.relowner owner, 'r'::"char" aclkind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT 'column', c.relname, NULL, a.attname, a.attacl, c.relowner, 'c'::"char"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT 'sequence', c.relname, NULL, NULL, c.relacl, c.relowner, 's'::"char"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'
 UNION ALL
 SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid), NULL, p.proacl, p.proowner, 'f'::"char"
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
), rows AS (
 SELECT kind,name,args,col,pg_get_userbyid(owner) owner,
 coalesce((SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
 'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.privilege_type)
 FROM aclexplode(coalesce(acl,acldefault(aclkind,owner))) x
 WHERE x.grantee=0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role')), '[]'::jsonb) grants
 FROM objects
) SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY kind,name,coalesce(args,''),coalesce(col,'')),'[]'::jsonb) FROM rows;`;

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

/** Offline only: no DB connection, no data DML, no deploy. The package cannot
 * execute unless a fresh exact ACL snapshot is supplied inside the window. */
export function buildFreezePackage({ snapshot, project, opensAt, closesAt }) {
  if (!['gcrhhxaopomtposmahsw', 'dydata-d6g0gd1v37fcddf21'].includes(project) || !Array.isArray(snapshot) || snapshot.length === 0) throw Error('Wrong project or empty snapshot');
  const opens = Date.parse(opensAt), closes = Date.parse(closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens || closes - opens > 4 * 3600_000) throw Error('Invalid freeze window');
  const snapshotText = JSON.stringify(snapshot);
  const guard = `DO $freeze$ DECLARE actual jsonb; BEGIN
 IF clock_timestamp() < ${literal(new Date(opens).toISOString())}::timestamptz OR clock_timestamp() > ${literal(new Date(closes).toISOString())}::timestamptz THEN RAISE EXCEPTION 'Outside authorized freeze window'; END IF;
 SELECT s INTO actual FROM (${FREEZE_SNAPSHOT_SQL.replace(/;\s*$/, '')}) q(s);
 IF actual IS DISTINCT FROM ${literal(snapshotText)}::jsonb THEN RAISE EXCEPTION 'Freeze ACL baseline drift'; END IF;
END $freeze$;`;
  const seen = new Set();
  const restore = snapshot.flatMap((object) => {
    const key = JSON.stringify([object.kind, object.name, object.args, object.col]);
    if (seen.has(key) || !Array.isArray(object.grants)) throw Error('Duplicate object or invalid grants'); seen.add(key);
    const objectTarget = target(object);
    return object.grants.map((grant) => {
      if (!ROLES.includes(grant.role) || !PRIVILEGES.has(grant.privilege) || typeof grant.grantable !== 'boolean') throw Error('Invalid original ACL');
      const role = grant.role === 'PUBLIC' ? 'PUBLIC' : identifier(grant.role);
      return `GRANT ${grant.privilege}${object.kind === 'column' ? ` (${identifier(object.col)})` : ''} ON ${objectTarget} TO ${role}${grant.grantable ? ' WITH GRANT OPTION' : ''};`;
    });
  });
  const revoked = snapshot.map((object) => ({ ...object, grants: [] }));
  const rollbackGuard = guard.replace(literal(snapshotText), literal(JSON.stringify(revoked)));
  const envelope = (statements) => `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='60s';\n${statements.join('\n')}\nCOMMIT;\n`;
  const apply = envelope([guard, ...snapshot.map(revoke), rollbackGuard]);
  const rollback = envelope([rollbackGuard, ...restore, guard]);
  return { project, snapshotSha256: hash(snapshotText), apply, rollback, applySha256: hash(apply), rollbackSha256: hash(rollback), objects: snapshot.length };
}
