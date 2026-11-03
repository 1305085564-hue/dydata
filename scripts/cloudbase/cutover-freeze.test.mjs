import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreezePackage, buildWriteLockSql, FREEZE_SNAPSHOT_SQL } from './cutover-freeze.mjs';
const snapshot = [
  { kind: 'table', name: 'videos', args: null, col: null, owner: 'postgres', grants: [{ role: 'authenticated', privilege: 'SELECT', grantable: false }] },
  { kind: 'column', name: 'videos', args: null, col: 'review_status', owner: 'postgres', grants: [{ role: 'authenticated', privilege: 'UPDATE', grantable: false }] },
  { kind: 'function', name: 'f', args: 'p_user uuid', col: null, owner: 'postgres', grants: [{ role: 'service_role', privilege: 'EXECUTE', grantable: true }] },
];
const input = { snapshot, project: 'gcrhhxaopomtposmahsw', opensAt: '2026-11-02T10:00:00Z', closesAt: '2026-11-02T12:00:00Z' };

test('freeze package binds exact ACL, time window, column grants and function overload', () => {
  const result = buildFreezePackage(input);
  assert.match(result.applyBatches.map(b=>b.sql).join('\n'), /clock_timestamp\(\)/);
  assert.match(result.applyBatches.map(b=>b.sql).join('\n'), /Freeze ACL baseline drift/);
  assert.match(result.applyBatches.map(b=>b.sql).join('\n'), /REVOKE SELECT \("review_status"\), INSERT/);
  assert.match(result.applyBatches.map(b=>b.sql).join('\n'), /REVOKE ALL PRIVILEGES ON FUNCTION public\."f"\(p_user uuid\)/);
  assert.match(result.rollbackBatches.map(b=>b.sql).join('\n'), /GRANT SELECT ON TABLE public\."videos" TO "authenticated"/);
  assert.match(result.rollbackBatches.map(b=>b.sql).join('\n'), /GRANT UPDATE \("review_status"\) ON TABLE/);
  assert.match(result.rollbackBatches.map(b=>b.sql).join('\n'), /GRANT EXECUTE ON FUNCTION .* WITH GRANT OPTION/);
  assert.doesNotMatch(result.applyBatches.map(b=>b.sql).join('\n'), /\b(?:DROP|TRUNCATE TABLE|DELETE FROM|INSERT INTO|UPDATE public)\b/);
  assert.equal(result.applyBatches.map(b=>b.sql).join('\n'), buildFreezePackage(input).applyBatches.map(b=>b.sql).join('\n'));
  assert.match(FREEZE_SNAPSHOT_SQL, /a\.attnum>0/);
  assert.doesNotMatch(FREEZE_SNAPSHOT_SQL, /attacl IS NOT NULL/);
});
test('freeze rejects wrong project, invalid window, injected identities and unbound privileges', () => {
  for (const change of [{ project: 'other' }, { excludeExtensionMembers: 'false' }, { closesAt: '2026-11-03T12:00:00Z' }, { snapshot: [] },
    { snapshot: [{ ...snapshot[2], args: 'uuid); DELETE FROM x;' }] },
    { snapshot: [{ ...snapshot[0], grants: [{ role: 'stranger', privilege: 'SELECT', grantable: false }] }] },
  ]) assert.throws(() => buildFreezePackage({ ...input, ...change }));
});
test('source write-lock inventory includes Auth and stays open for final export and handoff', () => {
  const names = Array.from({ length: 99 }, (_, i) => `t${i}`);
  const sql = buildWriteLockSql(names);
  assert.match(sql, /auth\.users IN SHARE MODE/);
  assert.match(sql, /idle_in_transaction_session_timeout='15min'/);
  assert.match(sql, /DYDATA_SOURCE_WRITE_LOCK_HELD/);
  assert.doesNotMatch(sql, /^(COMMIT|ROLLBACK);/m);
  assert.throws(() => buildWriteLockSql(names.slice(1)));
  assert.throws(() => buildWriteLockSql([...names.slice(1), names[1]]));
});
