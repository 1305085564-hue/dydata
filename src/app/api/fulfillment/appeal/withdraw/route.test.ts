import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { buildWithdrawAppealResponse } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/fulfillment/appeal/withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const signedIn = (async () => ({ supabase: {}, user: { id: "user-1" } })) as never;

test("未登录不能撤回补交申请", async () => {
  const response = await buildWithdrawAppealResponse(request({}), {
    requireSignedInUser: (async () => ({ response: NextResponse.json({ error: "未登录" }, { status: 401 }) })) as never,
    createAdminClient: (() => ({})) as never,
  });
  assert.equal(response.status, 401);
});

test("appealId 不是 uuid 直接 400，不碰数据库", async () => {
  let touched = false;
  const response = await buildWithdrawAppealResponse(request({ appealId: "x" }), {
    requireSignedInUser: signedIn,
    createAdminClient: (() => { touched = true; return {}; }) as never,
  });
  assert.equal(response.status, 400);
  assert.equal(touched, false);
});

test("本人待审申请撤回成功；条件里带本人和待审状态，已被处理时 409", async () => {
  const filters: Array<[string, unknown]> = [];
  let deletedRows: Array<{ id: string }> = [{ id: "a1" }];
  const admin = {
    from(table: string) {
      const builder = {
        delete() { return builder; },
        update() { return builder; },
        select() { return builder; },
        eq(col: string, value: unknown) { filters.push([`${table}.${col}`, value]); return builder; },
        in() { return builder; },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve({ data: table === "fulfillment_appeals" ? deletedRows : [], error: null });
        },
      };
      return builder;
    },
  };
  const deps = { requireSignedInUser: signedIn, createAdminClient: (() => admin) as never };
  const appealId = "11111111-1111-4111-8111-111111111111";

  const ok = await buildWithdrawAppealResponse(request({ appealId }), deps);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { withdrawn: true, todosClosed: true });
  assert.ok(filters.some(([key, value]) => key === "fulfillment_appeals.user_id" && value === "user-1"));
  assert.ok(filters.some(([key, value]) => key === "fulfillment_appeals.status" && value === "pending"));

  deletedRows = [];
  const handled = await buildWithdrawAppealResponse(request({ appealId }), deps);
  assert.equal(handled.status, 409);
});
