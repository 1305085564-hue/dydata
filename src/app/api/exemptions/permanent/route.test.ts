import assert from "node:assert/strict";
import test from "node:test";

import { buildPermanentExemptionResponse, buildClearPermanentExemptionResponse } from "./route";
import type { AdminActor } from "@/app/api/admin/auth-helper";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

function actor(overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    userId: "owner-1",
    role: "admin",
    companyRole: "company_owner",
    permissions: {},
    name: "老板",
    dataScope: "team",
    ...overrides,
  };
}

test("永久豁免设置：仅 company_owner 可调用原子 RPC", async () => {
  let received: unknown;
  const response = await buildPermanentExemptionResponse(
    { user_id: USER_ID, reason: "岗位不参与发布考核" },
    {
      requireCompanyOwnerActor: async () =>
        ({
          supabase: { marker: "session" },
          actor: actor(),
          scope: { kind: "team", visibleUserIds: [USER_ID], activeVisibleUserIds: [USER_ID] },
        }) as never,
      setPermanentExemptionAtomically: async (input) => {
        received = input;
        return { ok: true as const, data: { user_id: USER_ID, permanent: true } };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    supabase: { marker: "session" },
    userId: USER_ID,
    reason: "岗位不参与发布考核",
    groupModeTokenHash: undefined,
  });
});

test("永久豁免设置：admin 不能通过接口绕过 Owner-only", async () => {
  const response = await buildPermanentExemptionResponse(
    { user_id: USER_ID, reason: "原因" },
    {
      requireCompanyOwnerActor: async () =>
        ({ response: Response.json({ error: "仅公司所有者可设置不参与考核" }, { status: 403 }) }) as never,
      setPermanentExemptionAtomically: async () => {
        throw new Error("不应调用 RPC");
      },
    },
  );

  assert.equal(response.status, 403);
  assert.match(JSON.stringify(await response.json()), /仅公司所有者/);
});

test("永久豁免设置：原因为空或 user_id 非 uuid 时拒绝且不鉴权写库", async () => {
  const response = await buildPermanentExemptionResponse(
    { user_id: "bad", reason: " " },
    {
      requireCompanyOwnerActor: async () => {
        throw new Error("不应进入鉴权");
      },
      setPermanentExemptionAtomically: async () => {
        throw new Error("不应调用 RPC");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /uuid|原因/);
});

test("永久豁免撤销：调用专用 clear RPC，不能调用会清掉临时状态的通用 RPC", async () => {
  let received: unknown;
  const response = await buildClearPermanentExemptionResponse(
    { user_id: USER_ID },
    {
      requireCompanyOwnerActor: async () =>
        ({
          supabase: { marker: "session" },
          actor: actor(),
          scope: { kind: "team", visibleUserIds: [USER_ID], activeVisibleUserIds: [USER_ID] },
        }) as never,
      clearPermanentExemptionAtomically: async (input) => {
        received = input;
        return { ok: true as const, data: { user_id: USER_ID, cleared: true } };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    supabase: { marker: "session" },
    userId: USER_ID,
    groupModeTokenHash: undefined,
  });
});

test("永久豁免 RPC 错误不透传数据库细节", async () => {
  const response = await buildPermanentExemptionResponse(
    { user_id: USER_ID, reason: "原因" },
    {
      requireCompanyOwnerActor: async () =>
        ({
          supabase: {},
          actor: actor(),
          scope: { kind: "team", visibleUserIds: [USER_ID], activeVisibleUserIds: [USER_ID] },
        }) as never,
      setPermanentExemptionAtomically: async () => ({
        ok: false as const,
        status: 403,
        message: "仅公司所有者可设置不参与考核",
        cause: { message: "secret database detail" },
      }),
    },
  );

  assert.equal(response.status, 403);
  const body = JSON.stringify(await response.json());
  assert.match(body, /仅公司所有者/);
  assert.doesNotMatch(body, /secret database detail/);
});
