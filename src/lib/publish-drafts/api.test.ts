import test from "node:test";
import assert from "node:assert/strict";

import { ensureCanReview } from "./api";

test("有审核权限时返回规范化范围", async () => {
  const supabase = { rpc: async () => ({ data: [{ can_review: true, business_role: "team_admin", visible_user_ids: ["u1"] }], error: null }) };
  const result = await ensureCanReview(supabase as never, "u1");
  assert.deepEqual(result, { ok: true, scope: { can_review: true, business_role: "team_admin", visible_user_ids: ["u1"] } });
});

test("无权限和空返回分别给出 403 与 500", async () => {
  const forbidden = await ensureCanReview({ rpc: async () => ({ data: [{ can_review: false, business_role: "member", visible_user_ids: [] }], error: null }) } as never, "u1");
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.response.status, 403);

  const invalid = await ensureCanReview({ rpc: async () => ({ data: null, error: null }) } as never, "u1");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.response.status, 500);
});

test("RPC 查询错误返回服务端错误响应", async () => {
  const result = await ensureCanReview({ rpc: async () => ({ data: null, error: { message: "db down" } }) } as never, "u1");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 500);
});
