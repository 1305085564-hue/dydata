import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildVideoReviewStatusResponse } from "./[videoId]/review-status/route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACTOR_ID = "223e4567-e89b-42d3-a456-426614174000";
const OWNER_ID = "323e4567-e89b-42d3-a456-426614174000";

function buildRequest(body: unknown) {
  return new NextRequest(`https://dydata.cc/api/admin/content/${VIDEO_ID}/review-status`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildAuthorizedActor() {
  return {
    supabase: {} as never,
    actor: {
      userId: ACTOR_ID,
      role: "admin" as const,
      companyRole: "admin" as const,
      groupMode: false,
      permissions: { review_content: true },
      name: "复盘管理员",
      dataScope: "team" as const,
      teamId: "team-1",
    },
  };
}

test("无 review_content 权限时拒绝更新", async () => {
  let receivedOptions: unknown = null;
  const response = await buildVideoReviewStatusResponse(buildRequest({ status: "reviewed" }), VIDEO_ID, {
    requireAdminActor: async (options) => {
      receivedOptions = options;
      return { error: "无权限", status: 403 } as const;
    },
    buildPermissionContextForActor: async () => {
      throw new Error("无权限时不应加载范围");
    },
    createAdminClient: () => {
      throw new Error("无权限时不应访问数据库");
    },
    now: () => new Date("2026-09-14T12:00:00.000Z"),
    clearAdminContentListCache: () => undefined,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "无权限" });
  assert.deepEqual(receivedOptions, { requiredPermission: "review_content" });
});

test("非法状态参数在数据库访问前返回 400", async () => {
  const response = await buildVideoReviewStatusResponse(buildRequest({ status: "done" }), VIDEO_ID, {
    requireAdminActor: async () => buildAuthorizedActor(),
    buildPermissionContextForActor: async () => {
      throw new Error("参数错误时不应加载范围");
    },
    createAdminClient: () => {
      throw new Error("参数错误时不应访问数据库");
    },
    now: () => new Date("2026-09-14T12:00:00.000Z"),
    clearAdminContentListCache: () => undefined,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "status 只能是 pending 或 reviewed" });
});

test("有权限且视频在当前范围内时持久化 reviewed 状态", async () => {
  const reviewedAt = "2026-09-14T12:00:00.000Z";
  let updatePayload: unknown = null;
  let cacheCleared = false;

  const adminClient = {
    from(table: string) {
      assert.equal(table, "videos");
      return {
        select(selection: string) {
          assert.match(selection, /accounts/);
          return {
            eq() { return this; },
            async maybeSingle() {
              return {
                data: { id: VIDEO_ID, user_id: OWNER_ID, accounts: { profile_id: OWNER_ID } },
                error: null,
              };
            },
          };
        },
        update(payload: unknown) {
          updatePayload = payload;
          return {
            eq() { return this; },
            select() { return this; },
            async maybeSingle() {
              return {
                data: { id: VIDEO_ID, review_status: "reviewed", reviewed_at: reviewedAt },
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const response = await buildVideoReviewStatusResponse(
    buildRequest({ status: "reviewed", reviewed_at: reviewedAt }),
    VIDEO_ID,
    {
      requireAdminActor: async () => buildAuthorizedActor(),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: {
          userId: ACTOR_ID,
          role: "admin" as const,
          companyRole: "admin" as const,
          permissions: { review_content: true },
          teamId: "team-1",
          kind: "team" as const,
          visibleUserIds: [ACTOR_ID, OWNER_ID],
          activeVisibleUserIds: [ACTOR_ID, OWNER_ID],
        },
      }),
      createAdminClient: () => adminClient as never,
      now: () => new Date("2026-09-14T13:00:00.000Z"),
      clearAdminContentListCache: () => { cacheCleared = true; },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(updatePayload, {
    review_status: "reviewed",
    reviewed_at: reviewedAt,
    reviewed_by: ACTOR_ID,
  });
  assert.deepEqual(await response.json(), {
    ok: true,
    video: { id: VIDEO_ID, review_status: "reviewed", reviewed_at: reviewedAt },
  });
  assert.equal(cacheCleared, true);
});

test("撤销复盘时清空复盘时间与复盘人", async () => {
  let updatePayload: unknown = null;
  const adminClient = {
    from() {
      return {
        select() {
          return {
            eq() { return this; },
            async maybeSingle() {
              return { data: { id: VIDEO_ID, user_id: OWNER_ID, accounts: null }, error: null };
            },
          };
        },
        update(payload: unknown) {
          updatePayload = payload;
          return {
            eq() { return this; },
            select() { return this; },
            async maybeSingle() {
              return { data: { id: VIDEO_ID, review_status: "pending", reviewed_at: null }, error: null };
            },
          };
        },
      };
    },
  };

  const response = await buildVideoReviewStatusResponse(buildRequest({ status: "pending" }), VIDEO_ID, {
    requireAdminActor: async () => buildAuthorizedActor(),
    buildPermissionContextForActor: async () => ({
      permissionInfo: {} as never,
      scope: {
        userId: ACTOR_ID,
        role: "admin" as const,
        permissions: { review_content: true },
        teamId: "team-1",
        kind: "team" as const,
        visibleUserIds: [OWNER_ID],
      },
    }),
    createAdminClient: () => adminClient as never,
    now: () => new Date("2026-09-14T13:00:00.000Z"),
    clearAdminContentListCache: () => undefined,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(updatePayload, {
    review_status: "pending",
    reviewed_at: null,
    reviewed_by: null,
  });
});

test("有功能权限但视频不在当前公司范围时拒绝更新", async () => {
  const adminClient = {
    from() {
      return {
        select() {
          return {
            eq() { return this; },
            async maybeSingle() {
              return { data: { id: VIDEO_ID, user_id: OWNER_ID, accounts: null }, error: null };
            },
          };
        },
        update() {
          throw new Error("越界视频不应执行更新");
        },
      };
    },
  };

  const response = await buildVideoReviewStatusResponse(buildRequest({ status: "reviewed" }), VIDEO_ID, {
    requireAdminActor: async () => buildAuthorizedActor(),
    buildPermissionContextForActor: async () => ({
      permissionInfo: {} as never,
      scope: {
        userId: ACTOR_ID,
        role: "admin" as const,
        permissions: { review_content: true },
        teamId: "team-1",
        kind: "team" as const,
        visibleUserIds: [ACTOR_ID],
        activeVisibleUserIds: [ACTOR_ID],
      },
    }),
    createAdminClient: () => adminClient as never,
    now: () => new Date("2026-09-14T13:00:00.000Z"),
    clearAdminContentListCache: () => undefined,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "无权限修改该视频" });
});
