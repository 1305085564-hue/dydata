import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildTopicLibraryStatusPostResponse } from "./route";

test("topic-library-status 真 handler：鉴权失败返回分层字段", async () => {
  const response = await buildTopicLibraryStatusPostResponse(
    new NextRequest("https://dydata.cc/api/admin/content/topic-library-status", { method: "POST", body: "{}" }),
    {
      requireAdminActor: async () => ({ error: "无权限", status: 403 }) as never,
      buildDataAccessScope: async () => null,
      resolveVideoReviewReadOnlyScope: async (_client, scope) => scope,
      createAdminClient: () => ({} as never),
      resolveVideoTopicLibraryStatuses: async () => ({}),
    },
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, false);
  assert.equal(body.error, "无权限");
});

test("视频复盘只读状态接口接受同一 Supabase 项目内其他团队的作品", async () => {
  const actorScope = {
    userId: "actor-a",
    role: "member",
    permissions: { view_video_review: true },
    teamId: "team-a",
    kind: "self",
    visibleUserIds: ["actor-a"],
    activeVisibleUserIds: ["actor-a"],
  };
  const videoId = "video-team-b";
  let visibleRows: Array<{ id: string; topic_id: string | null }> = [];
  const response = await buildTopicLibraryStatusPostResponse(
    new NextRequest("https://dydata.cc/api/admin/content/topic-library-status", {
      method: "POST",
      body: JSON.stringify({ videoIds: [videoId] }),
    }),
    {
      requireAdminActor: async () => ({
        actor: { userId: "actor-a" },
        context: { scope: actorScope },
      }) as never,
      buildDataAccessScope: async () => actorScope as never,
      resolveVideoReviewReadOnlyScope: async (_client, scope) => ({
        ...scope,
        kind: "team",
        visibleUserIds: ["actor-a", "owner-b"],
        activeVisibleUserIds: ["actor-a", "owner-b"],
      }),
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            in: async () => ({
              data: [{ id: videoId, topic_id: "topic-b", user_id: "owner-b", accounts: { profile_id: "owner-b" } }],
              error: null,
            }),
          }),
        }),
      }) as never,
      resolveVideoTopicLibraryStatuses: async (_client, rows) => {
        visibleRows = rows.map((row) => ({ id: row.id, topic_id: row.topic_id ?? null }));
        return { [videoId]: { inLibrary: true } } as never;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(visibleRows, [{ id: videoId, topic_id: "topic-b" }]);
  assert.deepEqual((await response.json()).statuses, { [videoId]: { inLibrary: true } });
});
