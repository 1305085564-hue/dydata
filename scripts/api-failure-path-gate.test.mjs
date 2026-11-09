import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRoute, hasFailureAssertion } from "./api-failure-path-gate.mjs";

test("识别常见的失败路径断言写法", () => {
  for (const source of [
    "assert.equal(response.status, 401);",
    "assert.equal(result.response.status, 503);",
    "assert.strictEqual((await response).status, 409);",
    "assert.equal(response.status, 500, `${stdout}`);",
    "assert.ok(response.status === 422);",
  ]) {
    assert.equal(hasFailureAssertion(source), true, source);
  }
});

test("只断言成功路径或无关数字时不算失败路径覆盖", () => {
  for (const source of [
    "assert.equal(response.status, 200);",
    "assert.equal(body.topics.length, 401);",
    "assert.ok(response.ok);",
    "assert.equal(body.count, 500);",
  ]) {
    assert.equal(hasFailureAssertion(source), false, source);
  }
});

test("新增接口没有测试、只有成功测试、登记豁免三种结果互不混淆", () => {
  const route = "src/app/api/demo/route.ts";
  assert.equal(
    evaluateRoute(route, { readTestFiles: () => [] }).status,
    "missing",
  );
  assert.equal(
    evaluateRoute(route, { readTestFiles: () => ["assert.equal(response.status, 200);"] }).status,
    "missing",
  );
  assert.equal(
    evaluateRoute(route, { readTestFiles: () => ["assert.equal(response.status, 200);", "assert.equal(response.status, 403);"] }).status,
    "pass",
  );
  assert.deepEqual(
    evaluateRoute(route, { readTestFiles: () => [], exemptions: { [route]: "历史接口，待补" } }),
    { routePath: route, status: "exempt", reason: "历史接口，待补" },
  );
});
