import assert from "node:assert/strict";
import test from "node:test";

import { POST as postMark, defaultFulfillmentMarkDeps } from "@/app/api/admin/fulfillment/mark/route";
import { PATCH as patchDone, defaultNotificationDoneDeps } from "@/app/api/notifications/[id]/done/route";
import { PATCH as patchRead, defaultNotificationReadDeps } from "@/app/api/notifications/[id]/read/route";

const ID = "123e4567-e89b-42d3-a456-426614174000";

async function bodyOf(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function assertLayered(body: Record<string, unknown>) {
  for (const field of ["businessSucceeded", "permissionChecked", "auditStatus", "employeeNotificationStatus", "todoStatus", "compensationRequired"]) {
    assert.ok(field in body, `缺少分层字段 ${field}`);
  }
}

test("fulfillment/mark：真实 POST RPC 失败明确返回且补齐分层字段", async () => {
  const original = defaultFulfillmentMarkDeps.requireAdminServiceClient;
  defaultFulfillmentMarkDeps.requireAdminServiceClient = async () => ({
    response: Response.json({ error: "数据库不可用" }, { status: 503 }),
  }) as never;
  try {
    const response = await postMark(new Request("https://dydata.cc/api/admin/fulfillment/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: ID, recordDate: "2026-10-01", status: "confirmed_published" }),
    }));
    const body = await bodyOf(response);
    assert.equal(response.status, 503);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultFulfillmentMarkDeps.requireAdminServiceClient = original;
  }
});

test("notifications/done：真实 PATCH 未登录明确失败并补齐分层字段", async () => {
  const original = defaultNotificationDoneDeps.createClient;
  defaultNotificationDoneDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  try {
    const response = await patchDone(new Request("https://dydata.cc/api/notifications/n1/done", { method: "PATCH" }), { params: Promise.resolve({ id: "n1" }) });
    const body = await bodyOf(response);
    assert.equal(response.status, 401);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultNotificationDoneDeps.createClient = original;
  }
});

test("notifications/read：真实 PATCH 未登录明确失败并补齐分层字段", async () => {
  const original = defaultNotificationReadDeps.createClient;
  defaultNotificationReadDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  try {
    const response = await patchRead(new Request("https://dydata.cc/api/notifications/n1/read", { method: "PATCH" }), { params: Promise.resolve({ id: "n1" }) });
    const body = await bodyOf(response);
    assert.equal(response.status, 401);
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
  } finally {
    defaultNotificationReadDeps.createClient = original;
  }
});
