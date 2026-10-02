import assert from "node:assert/strict";
import test from "node:test";
import { createOperationResult } from "./operation-result";
import { createRequestContext } from "./request-context";

test("业务成功与后置副作用失败可以同时表达", () => {
  const context = createRequestContext({ route: "/api/example", operation: "write" });
  const result = createOperationResult({ context, data: { id: "1" }, businessSucceeded: true, permissionChecked: true, auditSucceeded: false, notificationSucceeded: false, compensationRequired: false });
  assert.equal(result.businessSucceeded, true);
  assert.equal(result.auditSucceeded, false);
  assert.equal(result.notificationSucceeded, false);
  assert.equal(result.requestId, context.requestId);
});
