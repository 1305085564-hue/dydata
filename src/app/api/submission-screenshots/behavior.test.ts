import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST, defaultSubmissionScreenshotDeps } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function assertLayered(body: Record<string, unknown>) {
  for (const field of ["businessSucceeded", "permissionChecked", "auditStatus", "employeeNotificationStatus", "todoStatus", "compensationRequired"]) {
    assert.ok(field in body, `缺少分层字段 ${field}`);
  }
}

test("submission-screenshots：依赖返回未登录时真实 handler 明确失败并只写一条日志", async () => {
  const original = defaultSubmissionScreenshotDeps.createClient;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultSubmissionScreenshotDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const response = await POST(new NextRequest("https://dydata.cc/api/submission-screenshots", {
      method: "POST",
      headers: { "x-dydata-request-id": REQUEST_ID },
      body: new FormData(),
    }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("x-dydata-request-id"), REQUEST_ID);
    const body = await response.json() as Record<string, unknown>;
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.error, "未登录");
  } finally {
    defaultSubmissionScreenshotDeps.createClient = original;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/submission-screenshots")).length, 1);
});
