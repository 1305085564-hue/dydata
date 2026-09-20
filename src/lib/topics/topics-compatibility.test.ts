import assert from "node:assert/strict";
import test from "node:test";
import { parseClaimsResponse } from "./v2-client-contract";

test("Topics claims 以 inProgressCount 为内部规范并保留旧键兼容", () => {
  const parsed = parseClaimsResponse({
    candidateCount: 3,
    scriptingCount: 3,
    inProgressCount: 2,
    claims: [],
  });

  assert.equal(parsed.inProgressCount, 2);
  assert.equal(parsed.candidateCount, 3);
  assert.equal(parsed.scriptingCount, 3);
});

test("Topics claims 缺少新键时仍返回兼容结构", () => {
  const parsed = parseClaimsResponse({ candidateCount: 4, scriptingCount: 4, claims: [] });
  assert.equal(parsed.inProgressCount, 0);
});
