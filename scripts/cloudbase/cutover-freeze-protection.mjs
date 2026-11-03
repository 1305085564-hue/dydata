import { readFileSync } from 'node:fs';
import { assertPackageLockWindow, assertSourceLockReceipt } from './cutover-cloudbase-driver.mjs';
import { buildFreezeSnapshotSql, FREEZE_MAX_BYTES, FREEZE_MIN_HEADROOM, freezeRequestBudget } from './cutover-freeze.mjs';
import { ensurePrivateFile, runPsqlSingleMessage } from './cutover-core.mjs';

const MAINTENANCE_DOMAINS = ['dydata.cc', 'direct.dydata.cc'];
const MAINTENANCE_ORIGINS = ['https://dydata.cc', 'https://direct.dydata.cc'];
const MAINTENANCE_PROOF_MAX_AGE_MS = 10 * 60_000;
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function proofTimestamp(value, fallback) {
  const timestamp = Date.parse(value ?? fallback ?? '');
  if (!Number.isFinite(timestamp)) throw new Error('Maintenance proof is missing an HTTP check timestamp');
  const age = Date.now() - timestamp;
  if (age < -2_000 || age > MAINTENANCE_PROOF_MAX_AGE_MS) throw new Error('Maintenance HTTP proof must be fresh');
  return timestamp;
}

function domainOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Maintenance proof domains must be explicit HTTPS origins'); }
  if (!MAINTENANCE_ORIGINS.includes(value) || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !MAINTENANCE_DOMAINS.includes(url.hostname)) {
    throw new Error('Maintenance proof must use the two approved HTTPS domains');
  }
  return url.origin;
}

function maintenanceHeaderPresent(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return false;
  const entries = [];
  if (typeof headers.forEach === 'function') headers.forEach((value, key) => entries.push([key, value]));
  else entries.push(...Object.entries(headers));
  return entries.some(([key, value]) => String(key).toLowerCase() === 'x-dydata-maintenance' && String(value) === '1');
}

/** Validate concrete two-domain HTTP evidence, not an environment flag. */
export function validateMaintenanceProof(proof) {
  if (Array.isArray(proof?.domains) && proof.domains.length !== 2) throw new Error('Maintenance proof must cover two distinct domains');
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || !Array.isArray(proof.domains)) throw new Error('A two-domain HTTP proof is required');
  const rootTime = proofTimestamp(proof.checkedAt ?? proof.capturedAt);
  const domains = [];
  const checks = [];
  for (const item of proof.domains) {
    const origin = domainOrigin(item?.domain ?? item?.origin);
    const hostname = new URL(origin).hostname;
    if (domains.includes(hostname)) throw new Error('Maintenance proof must cover two distinct domains');
    proofTimestamp(item.checkedAt, new Date(rootTime).toISOString());
    if (!Array.isArray(item.checks) || item.checks.length < 2) throw new Error('Each maintenance proof domain needs actual HTTP checks');
    let healthUrl = null;
    let maintenanceUrl = null;
    for (const check of item.checks) {
      let url;
      try { url = new URL(check?.url); } catch { throw new Error('Maintenance proof HTTP check is missing its URL'); }
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.search || url.hash) {
        throw new Error('Maintenance proof HTTP checks must match their declared HTTPS domain without credentials');
      }
      proofTimestamp(check.checkedAt, item.checkedAt ?? proof.checkedAt ?? proof.capturedAt);
      const status = check.status ?? check.statusCode;
      if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Maintenance proof HTTP check is missing its status');
      if (status === 200 && url.pathname === '/api/health' && !healthUrl) healthUrl = url.href;
      if (status === 503 && maintenanceHeaderPresent(check.headers ?? check.response?.headers) && !maintenanceUrl) maintenanceUrl = url.href;
    }
    if (!healthUrl) throw new Error('Each maintenance proof domain needs a successful health HTTP response');
    if (!maintenanceUrl) throw new Error('Each maintenance proof domain needs a maintenance response with an HTTP header');
    if (healthUrl === maintenanceUrl) throw new Error('Health and maintenance proof checks must use separate HTTP routes');
    domains.push(hostname);
    checks.push({ domain: hostname, healthUrl, maintenanceUrl });
  }
  if (!MAINTENANCE_DOMAINS.every((domain) => domains.includes(domain))) throw new Error('Maintenance proof must cover dydata.cc and direct.dydata.cc');
  return { checkedAt: new Date(rootTime).toISOString(), domains, checks };
}

/** Recheck both domains at every batch boundary using the exact preflight URLs. */
export async function assertMaintenanceLive(maintenanceProof, fetchImpl = globalThis.fetch) {
  if (!Array.isArray(maintenanceProof?.checks) || maintenanceProof.checks.length !== 2 || typeof fetchImpl !== 'function') {
    throw new Error('Live two-domain maintenance protection is required');
  }
  let results;
  try {
    results = await Promise.all(maintenanceProof.checks.map(async (item) => {
      const [health, maintained] = await Promise.all([
        fetchImpl(item.healthUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) }),
        fetchImpl(item.maintenanceUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) }),
      ]);
      return { health, maintained };
    }));
  } catch {
    throw new Error('Live maintenance HTTP recheck failed');
  }
  if (results.some(({ health }) => health?.status !== 200)) throw new Error('Live maintenance health check failed');
  if (results.some(({ maintained }) => maintained?.status !== 503 || !maintenanceHeaderPresent(maintained.headers))) {
    throw new Error('Live maintenance state is not active on both domains');
  }
}

function snapshotReadSql(snapshotSqlVariant) {
  const sql = buildFreezeSnapshotSql({ excludeExtensionMembers: snapshotSqlVariant === 'excluded' });
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; SELECT (s)::text AS snapshot FROM (${sql.replace(/;\s*$/, '')}) q(s); COMMIT;`;
}

function assertReadSqlBudget(sql, channel, maxBytes = FREEZE_MAX_BYTES) {
  const budget = freezeRequestBudget(sql, channel, maxBytes);
  if (budget.headroomBytes <= FREEZE_MIN_HEADROOM) throw new Error('Freeze snapshot read exceeds the package transport budget');
  return budget;
}

function extractFirstValue(result, field) {
  if (result?.lastCommand !== 'COMMIT') throw new Error('Read-only source query did not confirm COMMIT');
  const withRows = result.rowSets?.filter((rows) => rows.length > 0) ?? [];
  const value = withRows.at(-1)?.[0]?.[field] ?? null;
  if (typeof value !== 'string') throw new Error(`Source query did not return ${field}`);
  return value;
}

export async function readSourceFreezeSnapshot(connectionUrl, pkg, timeoutMs) {
  const sql = snapshotReadSql(pkg.snapshotSqlVariant);
  assertReadSqlBudget(sql, 'postgres', pkg.maxBytes);
  const result = await runPsqlSingleMessage(connectionUrl, sql, { timeoutMs: Math.min(timeoutMs, 30_000) });
  return JSON.parse(extractFirstValue(result, 'snapshot'));
}

export function validateSourceLockReadback(state, pid) {
  if (state?.pid !== pid || state.active !== true || state.publicTableCount !== 99 || state.lockedPublicTableCount !== 99 || state.authUsersLocked !== true || state.lockCount !== 100) {
    throw new Error('Independent source lock readback did not confirm each of the 99 public tables and auth.users');
  }
  return state;
}

export function buildSourceLockReadbackSql(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid source lock PID');
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SELECT jsonb_build_object(
 'pid',${pid},
 'active',EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${pid} AND datname=current_database()),
 'publicTableCount',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),
 'lockedPublicTableCount',(SELECT count(DISTINCT c.oid) FROM pg_tables t JOIN pg_namespace n ON n.nspname=t.schemaname JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.tablename JOIN pg_locks l ON l.relation=c.oid AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.pid=${pid} AND l.locktype='relation' AND l.mode='ShareLock' AND l.granted WHERE t.schemaname='public'),
 'authUsersLocked',EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_locks l ON l.relation=c.oid AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.pid=${pid} AND l.locktype='relation' AND l.mode='ShareLock' AND l.granted WHERE n.nspname='auth' AND c.relname='users'),
 'lockCount',(SELECT count(*) FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid=${pid} AND locktype='relation' AND mode='ShareLock' AND granted)
)::text AS lock_readback; COMMIT;`;
}

async function readSourceLockBackread(connectionUrl, pid, timeoutMs) {
  const sql = buildSourceLockReadbackSql(pid);
  assertReadSqlBudget(sql, 'postgres');
  const result = await runPsqlSingleMessage(connectionUrl, sql, { timeoutMs: Math.min(timeoutMs, 15_000) });
  return validateSourceLockReadback(JSON.parse(extractFirstValue(result, 'lock_readback')), pid);
}

export function createSourceFreezeProtection({ connectionUrl, lockReceiptPath, pkg, mode, timeoutMs, maintenanceProof }) {
  const allowRehearsal = mode === 'rehearsal';
  let pinned = null;
  return async () => {
    if (maintenanceProof) await assertMaintenanceLive(maintenanceProof);
    ensurePrivateFile(lockReceiptPath);
    const lock = JSON.parse(readFileSync(lockReceiptPath, 'utf8'));
    assertSourceLockReceipt(lock, Date.now(), { allowRehearsal });
    assertPackageLockWindow(pkg, lock);
    const identity = { lockId: lock.lockId, pid: lock.pid, source: lock.source, project: lock.project, rehearsal: lock.rehearsal };
    if (pinned && !sameJson(identity, pinned)) throw new Error('Source lock identity changed during freeze execution');
    pinned ??= identity;
    await readSourceLockBackread(connectionUrl, lock.pid, timeoutMs);
  };
}
