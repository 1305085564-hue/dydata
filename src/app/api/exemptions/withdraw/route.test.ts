import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { buildWithdrawExemptionResponse } from "./route";

test("未登录不能撤回", async () => {
  const response = await buildWithdrawExemptionResponse({
    requireSignedInUser: (async () => ({ response: NextResponse.json({ error: "未登录" }, { status: 401 }) })) as never,
  });
  assert.equal(response.status, 401);
});

test("登录用户撤回：只动自己的待审批申请，返回撤回条数", async () => {
  const seen: Array<[string, unknown]> = [];
  const supabase = {
    from(table: string) {
      const builder = {
        select() { return builder; },
        delete() { return builder; },
        eq(col: string, value: unknown) { seen.push([`${table}.${col}`, value]); return builder; },
        in() { return builder; },
        neq() { return builder; },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve({ data: table === "exemption_request" ? [{ id: "r1" }] : [], error: null });
        },
      };
      return pagedQueryDouble(builder);
    },
  };
  const response = await buildWithdrawExemptionResponse({
    requireSignedInUser: (async () => ({ supabase, user: { id: "user-1" } })) as never,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { withdrawn: 1, skippedReviewed: 0 });
  assert.ok(seen.some(([key, value]) => key === "exemption_request.applicant_user_id" && value === "user-1"));
});
