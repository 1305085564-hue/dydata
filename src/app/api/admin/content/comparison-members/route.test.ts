import assert from "node:assert/strict";
import test from "node:test";

import { buildComparisonMembersResponse } from "./route";

function baseDeps(overrides: Record<string, unknown> = {}) {
  const scope = {
    userId: "actor-a", role: "member", permissions: { view_video_review: true },
    teamId: "team-a", kind: "self", visibleUserIds: ["actor-a"], activeVisibleUserIds: ["actor-a"],
  };
  return {
    requireAdminActor: async () => ({
      actor: { userId: "actor-a", role: "member", permissions: { view_video_review: true } },
      context: { scope },
    }),
    canAccessAdminPath: () => true,
    resolveVideoReviewReadOnlyScope: async (_client: unknown, value: unknown) => value,
    createAdminClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) }) as never,
    assertSupabaseQuerySucceeded: (error: { message: string } | null) => {
      if (error) throw new Error(error.message);
    },
    ...overrides,
  } as never;
}

test("成员选项失败路径：未登录、无路径权限、无权限范围、查询失败都不返回假列表", async () => {
  const unauth = await buildComparisonMembersResponse(baseDeps({
    requireAdminActor: async () => ({ error: "未登录", status: 401 }),
  }));
  assert.equal(unauth.status, 401);

  const noPathPermission = await buildComparisonMembersResponse(baseDeps({ canAccessAdminPath: () => false }));
  assert.equal(noPathPermission.status, 403);
  assert.equal((await noPathPermission.json()).error, "无权限");

  const noContext = await buildComparisonMembersResponse(baseDeps({
    requireAdminActor: async () => ({ actor: { userId: "actor-a", role: "member", permissions: {} }, context: null }),
  }));
  assert.equal(noContext.status, 403);
  assert.equal((await noContext.json()).error, "用户权限范围加载失败");

  await assert.rejects(
    buildComparisonMembersResponse(baseDeps({
      createAdminClient: () => ({
        from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "db down" } }) }) }),
      }),
      assertSupabaseQuerySucceeded: (error: { message: string } | null) => {
        if (error) throw new Error("加载可对比成员失败");
      },
    })),
    /加载可对比成员失败/,
  );
});

test("视频复盘成员选项包含同一 Supabase 项目内其他团队的在职成员", async () => {
  const actorScope = {
    userId: "actor-a",
    role: "member",
    permissions: { view_video_review: true },
    teamId: "team-a",
    kind: "self",
    visibleUserIds: ["actor-a"],
    activeVisibleUserIds: ["actor-a"],
  };
  let selectedIds: string[] = [];
  const query = {
    select: () => query,
    in: async (_column: string, ids: string[]) => {
      selectedIds = ids;
      return {
        data: [
          { id: "owner-b", name: "Team B 成员", membership_status: "active" },
          { id: "former-b", name: "已归档成员", membership_status: "archived" },
        ],
        error: null,
      };
    },
  };
  const response = await buildComparisonMembersResponse({
    requireAdminActor: async () => ({
      actor: { userId: "actor-a", role: "member", permissions: { view_video_review: true } },
      context: { scope: actorScope },
    }) as never,
    canAccessAdminPath: () => true,
    resolveVideoReviewReadOnlyScope: async (_client, scope) => ({
      ...scope,
      kind: "team",
      visibleUserIds: ["actor-a", "owner-b", "former-b"],
      activeVisibleUserIds: ["actor-a", "owner-b"],
    }),
    createAdminClient: () => ({ from: () => query }) as never,
    assertSupabaseQuerySucceeded: (error) => {
      if (error) throw new Error(error.message);
    },
  });

  assert.deepEqual(selectedIds, ["actor-a", "owner-b"]);
  assert.deepEqual((await response.json()).profiles, [{ id: "owner-b", name: "Team B 成员" }]);
});
