import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectServiceKey } from './service-key-check.mjs';
const key = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.unsigned`;
test('reminders classify every boundary without emitting the token', () => {
  for (const [days, expected] of [[-1,'EXPIRED'],[0,'EXPIRED'],[7,'DUE_7_DAYS'],[14,'DUE_14_DAYS'],[30,'DUE_30_DAYS'],[90,'NOT_DUE']]) {
    const token = key({ role: 'service_role', exp: 1800000000 + days * 86400 });
    const result = inspectServiceKey(token, 1800000000 * 1000);
    assert.equal(result.state, expected);
    assert.equal(result.verifiedSignature, false);
    assert.ok(!JSON.stringify(result).includes(token));
  }
  assert.equal(inspectServiceKey(key({role:'service_role'})).state, 'NO_EXPIRY_CLAIM_REQUIRES_PLATFORM_CHECK');
});
test('bad credentials fail closed without exposing values', () => {
  for (const token of [undefined, 'secret', key({role:'authenticated'}), key({role:'service_role',exp:'123'})]) assert.throws(() => inspectServiceKey(token));
});
