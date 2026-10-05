import assert from "node:assert/strict";
import test from "node:test";

import { POST as postPermanent, defaultPermanentExemptionDeps } from "@/app/api/exemptions/permanent/route";
import { POST as postReopen, defaultReopenExemptionDeps } from "@/app/api/exemptions/reopen/route";
import { POST as postPermission, defaultPermissionRequestApplyDeps } from "@/app/api/permission-requests/apply/route";
import { POST as postUsage, defaultUsageEventsDeps } from "@/app/api/usage-events/route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "11111111-1111-4111-8111-111111111112";

async function bodyOf(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function assertLayered(body: Record<string, unknown>) {
  for (const field of ["businessSucceeded", "permissionChecked", "auditStatus", "employeeNotificationStatus", "todoStatus", "compensationRequired"]) {
    assert.ok(field in body, `缺少分层字段 ${field}`);
  }
}

test("exemptions/permanent：真实 POST 依赖拒绝明确失败，分层字段与 request id 保留", async () => {
  const original = defaultPermanentExemptionDeps.requireCompanyOwnerActor;
  defaultPermanentExemptionDeps.requireCompanyOwnerActor = async () => ({ response: Response.json({ error: "无权限" }, { status: 403 }) }) as never;
  try {
    const response = await postPermanent(new Request("https://dydata.cc/api/exemptions/permanent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
      body: JSON.stringify({ user_id: USER_ID, reason: "测试" }),
    }));
    const body = await bodyOf(response);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("x-dydata-request-id"), REQUEST_ID);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultPermanentExemptionDeps.requireCompanyOwnerActor = original;
  }
});

test("exemptions/reopen：真实 POST 依赖拒绝明确失败并补齐分层字段", async () => {
  const original = defaultReopenExemptionDeps.requireExemptionManagerActor;
  defaultReopenExemptionDeps.requireExemptionManagerActor = async () => ({ response: Response.json({ error: "无权限" }, { status: 403 }) }) as never;
  try {
    const response = await postReopen(new Request("https://dydata.cc/api/exemptions/reopen", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
      body: JSON.stringify({ request_id: USER_ID }),
    }));
    const body = await bodyOf(response);
    assert.equal(response.status, 403);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultReopenExemptionDeps.requireExemptionManagerActor = original;
  }
});

test("permission-requests/apply：真实 POST 未登录明确失败并补齐分层字段", async () => {
  const original = defaultPermissionRequestApplyDeps.createClient;
  defaultPermissionRequestApplyDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  try {
    const response = await postPermission(new Request("https://dydata.cc/api/permission-requests/apply", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
      body: JSON.stringify({ moduleTitle: "测试" }),
    }));
    const body = await bodyOf(response);
    assert.equal(response.status, 401);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultPermissionRequestApplyDeps.createClient = original;
  }
});

test("usage-events：真实 POST 未登录保持明确跳过结果并补齐分层字段", async () => {
  const original = defaultUsageEventsDeps.createClient;
  defaultUsageEventsDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  try {
    const response = await postUsage(new Request("https://dydata.cc/api/usage-events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
      body: JSON.stringify({ path: "/dashboard", eventType: "page_view" }),
    }));
    const body = await bodyOf(response);
    assert.equal(response.status, 202);
    assert.equal(body.ok, false);
    assertLayered(body);
  } finally {
    defaultUsageEventsDeps.createClient = original;
  }
});
