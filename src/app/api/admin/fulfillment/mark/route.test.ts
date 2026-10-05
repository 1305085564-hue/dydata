import assert from "node:assert/strict";
import test from "node:test";

import { buildFulfillmentMarkResponse } from "./route";

const UID = "123e4567-e89b-42d3-a456-426614174000";
const base = {
  userId: UID,
  recordDate: "2026-10-01",
  status: "confirmed_published",
  reason: "人工复核",
};

function deps(result: { data: unknown; error: unknown } | Error) {
  return {
    requireAdminServiceClient: async () => ({
      actor: { userId: "admin-1", role: "admin", companyRole: "admin" },
      scope: { activeVisibleUserIds: [UID], visibleUserIds: [UID], kind: "team" },
      supabase: { rpc: async () => result instanceof Error ? Promise.reject(result) : result },
    }) as never,
    requireOwnerOrAdminRole: () => null,
    requireActiveVisibleUsers: () => null,
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
