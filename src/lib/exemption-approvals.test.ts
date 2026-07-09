import test from "node:test";
import assert from "node:assert/strict";

import {
  collectApprovalRequestIds,
  getCommandHubDefaultTab,
  resolveApprovalRequestId,
} from "./exemption-approvals";

const REQUEST_ID = "f130ee78-9d07-477e-a918-c7bbd43ff759";
const FALLBACK_ID = "2d7f1eab-9c4d-4b38-9631-a434543604dd";

test("resolveApprovalRequestId 优先使用 request_id", () => {
  assert.equal(
    resolveApprovalRequestId({
      id: "grant-row-1",
      request_id: REQUEST_ID,
    }),
    REQUEST_ID,
  );
});

test("resolveApprovalRequestId 在 id 合法时回退到 id", () => {
  assert.equal(
    resolveApprovalRequestId({
      id: FALLBACK_ID,
    }),
    FALLBACK_ID,
  );
});

test("collectApprovalRequestIds 过滤非法编号并去重", () => {
  assert.deepEqual(
    collectApprovalRequestIds([
      { id: "legacy-row", request_id: REQUEST_ID },
      { id: REQUEST_ID },
      { id: FALLBACK_ID },
      { id: "not-a-uuid" },
    ]),
    [REQUEST_ID, FALLBACK_ID],
  );
});

test("getCommandHubDefaultTab 按 待办 -> 审批 -> 通知 的顺序切换", () => {
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 2, approvalCount: 5, isAdmin: true }),
    "todos",
  );
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 0, approvalCount: 5, isAdmin: true }),
    "approvals",
  );
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 0, approvalCount: 5, isAdmin: false }),
    "notifications",
  );
});
