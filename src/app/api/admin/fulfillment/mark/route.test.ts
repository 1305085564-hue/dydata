import assert from "node:assert/strict";
import test from "node:test";

import { buildAbsenceNotification, buildFulfillmentMarkResponse } from "./route";

const UID = "123e4567-e89b-42d3-a456-426614174000";
const base = {
  userId: UID,
  recordDate: "2026-10-01",
  status: "confirmed_published",
  reason: "人工复核",
};

function deps(result: { data: unknown; error: unknown } | Error, emit?: (input: unknown) => Promise<{ ok: boolean; inserted: number }>) {
  return {
    requireAdminServiceClient: async () => ({
      actor: { userId: "admin-1", role: "admin", companyRole: "admin" },
      scope: { activeVisibleUserIds: [UID], visibleUserIds: [UID], kind: "team" },
      supabase: { rpc: async () => result instanceof Error ? Promise.reject(result) : result },
    }) as never,
    requireOwnerOrAdminRole: () => null,
    requireActiveVisibleUsers: () => null,
      emit,
  } as never;
}

test("履约标记成功返回 RPC 结果", async () => {
  const response = await buildFulfillmentMarkResponse(base, deps({ data: { ok: true }, error: null }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("履约标记 RPC 返回失败或 thrown 时明确 500", async () => {
  assert.equal((await buildFulfillmentMarkResponse(base, deps({ data: null, error: { message: "db" } }))).status, 500);
  assert.equal((await buildFulfillmentMarkResponse(base, deps(new Error("db")))).status, 500);
});

test("履约标记校验与权限失败不写库", async () => {
  const invalid = await buildFulfillmentMarkResponse({ ...base, userId: "bad" }, deps({ data: {}, error: null }));
  assert.equal(invalid.status, 400);
  const forbidden = await buildFulfillmentMarkResponse(base, {
    requireAdminServiceClient: async () => ({}) as never,
    requireOwnerOrAdminRole: () => Response.json({ error: "无权限" }, { status: 403 }),
    requireActiveVisibleUsers: () => null,
  } as never);
  assert.equal(forbidden.status, 403);
});

test("标记缺勤后给员工发带原因和联系人的通知", async () => {
  const notifications: unknown[] = [];
  const response = await buildFulfillmentMarkResponse(
    { ...base, status: "absent", reason: "当天未提交" },
    deps({ data: { ok: true }, error: null }, async (input) => {
      notifications.push(input);
      return { ok: true, inserted: 1 };
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(notifications.length, 1);
  assert.deepEqual(buildAbsenceNotification({ recordDate: "2026-10-01", reason: "当天未提交", markerName: "管理员甲" }), {
    title: "你在 2026-10-01 被记为缺勤",
    body: "原因：当天未提交\n标记者：管理员甲。如有疑问，请联系管理员。",
  });
});
