import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildViolationDetailResponse } from "./route";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("详情读取先判私有案例权限，不能直接把 admin client 作为普通用户 fallback", () => {
  assert.match(source, /buildViolationDetailResponse/);
  assert.match(source, /canAccessPrivateViolationCases/);
  assert.doesNotMatch(source, /fallbackDetailClient:\s*createAdminClient\(\)/);
});

function makeDeps(profile: { role: "member" | "owner"; permissions: Record<string, boolean> }, status: string) {
  return {
    getAuthenticatedContext: async () => ({ supabase: {} as never, user: { id: "user-1" } }),
    getUserProfile: async () => profile,
    createAdminClient: () => ({ admin: true } as never),
    loadViolationCaseDetail: async () => ({ data: { id: "case-1", status }, errorMessage: null }),
  } as never;
}

test("普通 member 不能读取未审核详情，管理员可以读取", async () => {
  const request = new NextRequest("https://dydata.cc/api/violations/case-1");
  const context = { params: Promise.resolve({ id: "case-1" }) };
  const memberResponse = await buildViolationDetailResponse(
    request,
    context,
    makeDeps({ role: "member", permissions: {} }, "submitted"),
  );
  assert.equal(memberResponse.status, 404);

  const adminResponse = await buildViolationDetailResponse(
    request,
    context,
    makeDeps({ role: "owner", permissions: {} }, "submitted"),
  );
  assert.equal(adminResponse.status, 200);
});
