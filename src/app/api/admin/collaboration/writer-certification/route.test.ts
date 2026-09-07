import assert from "node:assert/strict";
import test from "node:test";

import { buildWriterCertificationResponse } from "./route-core";

const actorId = "123e4567-e89b-42d3-a456-426614174001";
const targetId = "123e4567-e89b-42d3-a456-426614174002";

function createDeps(overrides: Record<string, unknown> = {}) {
  let writeInput: unknown = null;
  let requiredPermission: unknown = null;
  const deps = {
    requireAdminActor: async (options?: { requiredPermission?: string }) => {
      requiredPermission = options?.requiredPermission ?? null;
      return {
        supabase: {},
        actor: {
          userId: actorId,
          name: "认证管理员",
          role: "admin",
          companyRole: "company_owner",
          permissions: { manage_members: true },
          dataScope: "team",
          membershipStatus: "active",
        },
      };
    },
    buildPermissionContextForActor: async () => ({
      scope: { activeVisibleUserIds: [actorId, targetId], visibleUserIds: [actorId, targetId] },
    }),
    createAdminClient: () => ({}),
    loadWriterCertificationTarget: async () => ({
      id: targetId,
      name: "待认证文案",
      membershipStatus: "active",
      companyRole: "member",
    }),
    saveWriterCertification: async (input: unknown) => {
      writeInput = input;
      return {
        userId: targetId,
        certified: true,
        certifiedBy: actorId,
        certifiedByName: "认证管理员",
        updatedAt: "2026-09-07T08:00:00.000Z",
      };
    },
    ...overrides,
  };
  return {
    deps,
    requiredPermission: () => requiredPermission,
    writeInput: () => writeInput,
  };
}

test("文案认证拒绝无效请求体", async () => {
  const injected = createDeps();
  const response = await buildWriterCertificationResponse({ userId: "not-a-uuid", certified: true }, injected.deps as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "userId 必须是合法 UUID" });
});

test("文案认证固定要求成员管理权限", async () => {
  const injected = createDeps();
  const response = await buildWriterCertificationResponse({ userId: targetId, certified: true }, injected.deps as never);

  assert.equal(response.status, 200);
  assert.equal(injected.requiredPermission(), "manage_members");
});

test("文案认证拒绝当前操作范围外的目标，不触发写入", async () => {
  const injected = createDeps({
    buildPermissionContextForActor: async () => ({
      scope: { activeVisibleUserIds: [actorId], visibleUserIds: [actorId, targetId] },
    }),
  });
  const response = await buildWriterCertificationResponse({ userId: targetId, certified: true }, injected.deps as never);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "不能认证当前权限范围外或已归档的成员" });
  assert.equal(injected.writeInput(), null);
});

test("文案认证拒绝归档目标，不触发写入", async () => {
  const injected = createDeps({
    loadWriterCertificationTarget: async () => ({
      id: targetId,
      name: "已归档文案",
      membershipStatus: "archived",
      companyRole: "member",
    }),
  });
  const response = await buildWriterCertificationResponse({ userId: targetId, certified: false }, injected.deps as never);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "不能认证当前权限范围外或已归档的成员" });
  assert.equal(injected.writeInput(), null);
});

test("文案认证只以当前登录管理员写入认证人和姓名快照", async () => {
  const injected = createDeps();
  const response = await buildWriterCertificationResponse({
    userId: targetId,
    certified: true,
    certifiedBy: "forged-admin-id",
    certifiedByName: "伪造名字",
  }, injected.deps as never);

  assert.equal(response.status, 200);
  assert.deepEqual(injected.writeInput(), {
    supabase: {},
    userId: targetId,
    certified: true,
    certifiedBy: actorId,
    certifiedByName: "认证管理员",
  });
  assert.deepEqual(await response.json(), {
    data: {
      userId: targetId,
      certified: true,
      certifiedBy: actorId,
      certifiedByName: "认证管理员",
      updatedAt: "2026-09-07T08:00:00.000Z",
    },
  });
});
