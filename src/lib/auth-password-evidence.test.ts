import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeEvidence } from '../../scripts/password-notice-smoke.mjs';

const names = ['login-form', 'forgot-entry', 'return-login', 'reset-direct', 'reset-code', 'reset-fragment', 'external-next', 'backslash-next', 'control-next'];
const input = () => ({ baseURL: 'http://127.0.0.1:3418/', scenarios: names.map((name) => ({ name, passed: true })), requests: [] as Array<{ url: string; method: string }>, errors: [] as string[] });

test('浏览器统计来自记录，缺少或失败的场景不能通过', () => {
  const evidence = input();
  assert.equal(summarizeEvidence(evidence).passed, true);
  assert.equal(summarizeEvidence(evidence).scenarios, evidence.scenarios.length);
  evidence.scenarios.pop();
  assert.equal(summarizeEvidence(evidence).passed, false);
  evidence.scenarios.push({ name: 'control-next', passed: false });
  assert.equal(summarizeEvidence(evidence).passed, false);
  evidence.scenarios[evidence.scenarios.length - 1] = { name: 'login-form', passed: true };
  assert.equal(summarizeEvidence(evidence).passed, false);
});

test('真实请求数量、外部请求、重置、POST和页面异常独立阻断', () => {
  for (const [request, field] of [
    [{ url: 'https://review-example.invalid/', method: 'GET' }, 'externalRequests'],
    [{ url: 'http://127.0.0.1:3418/auth/v1/recover', method: 'GET' }, 'resetRequests'],
    [{ url: 'http://127.0.0.1:3418/login', method: 'POST' }, 'postRequests'],
  ] as const) {
    const evidence = input(); evidence.requests.push(request);
    const result = summarizeEvidence(evidence);
    assert.equal(result.passed, false);
    assert.equal(result[field], 1);
    assert.equal(result.requestCount, evidence.requests.length);
    assert.deepEqual(result.forbidden, evidence.requests);
  }
  const evidence = input(); evidence.errors.push('synthetic page error');
  assert.equal(summarizeEvidence(evidence).pageErrors, 1);
  assert.equal(summarizeEvidence(evidence).passed, false);
});
