import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// No cloud/network load: exercise the actual production fallback in isolated
// processes. Two workers model two Vercel instances, not Vercel throughput.
process.env.NODE_ENV = 'production';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.RATE_LIMIT_DISABLED;
let outbound = 0;
globalThis.fetch = async () => { outbound += 1; throw new Error('network forbidden'); };
const { checkApiRateLimit } = await import('../../src/lib/api-rate-limit.ts');
const { checkRateLimit } = await import('../../src/lib/rate-limit.ts');

async function apiBurst(path, identifier, count) {
  let allowed = 0;
  for (let n = 0; n < count; n += 1) allowed += Number((await checkApiRateLimit({ pathname: path, identifier })).allowed);
  return { total: count, allowed, rejected: count - allowed };
}
if (process.argv.includes('--worker')) {
  const result = await apiBurst('/api/dashboard/leaderboard', 'user:same-user', 121);
  assert.deepEqual(result, { total: 121, allowed: 120, rejected: 1 });
  console.log(JSON.stringify(result));
} else {
  const started = Date.now();
  const cost = { total: 0, allowed: 0, rejected: 0 };
  for (let user = 0; user < 84; user += 1) {
    const result = await apiBurst('/api/ocr-screenshot', `user:peak-${user}`, 21);
    for (const key of Object.keys(cost)) cost[key] += result[key];
  }
  assert.deepEqual(cost, { total: 1764, allowed: 1680, rejected: 84 });
  const defaults = await apiBurst('/api/dashboard/leaderboard', 'user:shared-default', 120);
  const nextRoute = await apiBurst('/api/dashboard/activity', 'user:shared-default', 1);
  assert.equal(defaults.allowed, 120); assert.equal(nextRoute.rejected, 1);
  const page = { total: 84, allowed: 0, rejected: 0 };
  for (let n = 0; n < 84; n += 1) page[checkRateLimit('same-office-ip').allowed ? 'allowed' : 'rejected'] += 1;
  assert.deepEqual(page, { total: 84, allowed: 20, rejected: 64 });
  const workers = Array.from({ length: 2 }, () => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker'], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim());
  });
  assert.equal(workers.reduce((sum, row) => sum + row.allowed, 0), 240);
  assert.equal(outbound, 0);
  const result = { capturedAt: new Date().toISOString(), runtime: process.version, kind: 'actual-source-local-process-model', employees: 84,
    apiCostBurst: cost, sharedDefault: { defaults, nextRoute }, sharedOfficePageBurst: page,
    sameUserTwoIndependentProcesses: workers, outboundRequests: outbound, elapsedMs: Date.now() - started,
    limitations: 'No real Redis, Vercel concurrency or CloudBase capacity measurement; 15:00 burst is a scenario, not observed employee traffic.' };
  const index = process.argv.indexOf('--out');
  if (index !== -1) writeFileSync(process.argv[index + 1], JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
}
