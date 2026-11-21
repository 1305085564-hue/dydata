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
  const original = defaultSubmissionScreenshotDeps.getCurrentUserContext;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultSubmissionScreenshotDeps.getCurrentUserContext = async () => ({ user: null }) as never;
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
    defaultSubmissionScreenshotDeps.getCurrentUserContext = original;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/submission-screenshots")).length, 1);
});

test("submission-screenshots：管理员连接只查询本人在职账号", async () => {
  const originalUserContext = defaultSubmissionScreenshotDeps.getCurrentUserContext;
  const originalPermissionContext = defaultSubmissionScreenshotDeps.getCurrentPermissionContext;
  const originalAdminClient = defaultSubmissionScreenshotDeps.createAdminClient;
  const filters: Array<[string, string]> = [];
  const userId = "user-1";

  defaultSubmissionScreenshotDeps.getCurrentUserContext = async () => ({ user: { id: userId } }) as never;
  defaultSubmissionScreenshotDeps.getCurrentPermissionContext = async () => ({
    permissionInfo: { userId },
    scope: { activeVisibleUserIds: [userId], visibleUserIds: [userId] },
  }) as never;
  defaultSubmissionScreenshotDeps.createAdminClient = () => {
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters.push([column, value]);
        return query;
      },
      single: async () => ({ data: null, error: { code: "PGRST116" } }),
    };
    return { from: (table: string) => {
      assert.equal(table, "accounts");
      return query;
    } } as never;
  };

  try {
    const formData = new FormData();
    formData.set("account_id", "another-users-account");
    formData.set("asset_role", "screenshot_1");
    formData.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "capture.png", { type: "image/png" }));

    const response = await POST(new NextRequest("https://dydata.cc/api/submission-screenshots", {
      method: "POST",
      body: formData,
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(filters, [
      ["id", "another-users-account"],
      ["profile_id", userId],
    ]);
  } finally {
    defaultSubmissionScreenshotDeps.getCurrentUserContext = originalUserContext;
    defaultSubmissionScreenshotDeps.getCurrentPermissionContext = originalPermissionContext;
    defaultSubmissionScreenshotDeps.createAdminClient = originalAdminClient;
  }
});

test("submission-screenshots：权限核心无在职范围时拒绝且不访问账号表", async () => {
  const originalUserContext = defaultSubmissionScreenshotDeps.getCurrentUserContext;
  const originalPermissionContext = defaultSubmissionScreenshotDeps.getCurrentPermissionContext;
  const originalAdminClient = defaultSubmissionScreenshotDeps.createAdminClient;
  let accountTableRead = false;

  defaultSubmissionScreenshotDeps.getCurrentUserContext = async () => ({ user: { id: "archived-user" } }) as never;
  defaultSubmissionScreenshotDeps.getCurrentPermissionContext = async () => null;
  defaultSubmissionScreenshotDeps.createAdminClient = () => {
    accountTableRead = true;
    throw new Error("归档用户不能访问账号表");
  };

  try {
    const response = await POST(new NextRequest("https://dydata.cc/api/submission-screenshots", {
      method: "POST",
      body: new FormData(),
    }));
    assert.equal(response.status, 403);
    assert.equal(accountTableRead, false);
  } finally {
    defaultSubmissionScreenshotDeps.getCurrentUserContext = originalUserContext;
    defaultSubmissionScreenshotDeps.getCurrentPermissionContext = originalPermissionContext;
    defaultSubmissionScreenshotDeps.createAdminClient = originalAdminClient;
  }
});
