import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildPatch24hResponse, defaultPatch24hRouteDeps, POST } from "./route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";
const SNAPSHOT_ID = "423e4567-e89b-42d3-a456-426614174000";
const ACTOR_ID = "223e4567-e89b-42d3-a456-426614174000";
const OWNER_ID = "323e4567-e89b-42d3-a456-426614174000";

function buildRequest(body: unknown) {
  return new NextRequest(`https://dydata.cc/api/admin/videos/${VIDEO_ID}/patch-24h`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
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
      permissions: { review_content: true },
      name: "复盘管理员",
      dataScope: "team" as const,
      teamId: "team-1",
      membershipStatus: "active" as const,
      activeVisibleUserIds: [ACTOR_ID, OWNER_ID],
    },
  };
}

function buildScopeContext(visibleIds = [ACTOR_ID, OWNER_ID]) {
  return {
    permissionInfo: {} as never,
    scope: {
      userId: ACTOR_ID,
      role: "admin" as const,
      companyRole: "admin" as const,
      permissions: { review_content: true },
      teamId: "team-1",
      kind: "team" as const,
      visibleUserIds: visibleIds,
      activeVisibleUserIds: visibleIds,
    },
  };
}

test("无 review_content 权限时拒绝补录，且不触达数据库", async () => {
  let receivedOptions: unknown = null;
  const response = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "1000" } }),
    VIDEO_ID,
    {
      requireAdminActor: async (options) => {
        receivedOptions = options;
        return { error: "无权限", status: 403 } as const;
      },
      buildPermissionContextForActor: async () => {
        throw new Error("无权限时不应加载范围");
      },
      createClient: async () => {
        throw new Error("无权限时不应建立数据库连接");
      },
    },
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.error, "无权限");
  assert.deepEqual(receivedOptions, { requiredPermission: "review_content" });
});

test("有权限但视频不在当前可见范围内时拒绝补录", async () => {
  const userClient = {
    from(table: string) {
      assert.equal(table, "videos");
      return {
        select() {
          return {
            eq() { return this; },
            async maybeSingle() {
              return {
                data: {
                  id: VIDEO_ID,
                  user_id: OWNER_ID,
                  anomaly_status: "未满24h",
                  accounts: { profile_id: OWNER_ID },
                },
                error: null,
              };
            },
          };
        },
        update() {
          throw new Error("越界视频不应写库");
        },
      };
    },
  };

  const response = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "1000" } }),
    VIDEO_ID,
    {
      requireAdminActor: async () => buildAuthorizedActor(),
      buildPermissionContextForActor: async () => buildScopeContext([ACTOR_ID]),
      createClient: async () => userClient as never,
    },
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.error, "无权限修改该视频");
});

test("参数错误（非法 videoId / 非法 JSON / 非法指标）在写库前返回 400", async () => {
  const deps = {
    requireAdminActor: async () => buildAuthorizedActor(),
    buildPermissionContextForActor: async () => {
      throw new Error("参数错误时不应加载范围");
    },
    createClient: async () => {
      throw new Error("参数错误时不应写库");
    },
  };

  const badIdResponse = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "100" } }),
    "not-a-uuid",
    deps,
  );
  assert.equal(badIdResponse.status, 400);
  assert.equal((await badIdResponse.json()).code, "INVALID_INPUT");

  const badJsonResponse = await buildPatch24hResponse(
    buildRequest("{bad json"),
    VIDEO_ID,
    deps,
  );
  assert.equal(badJsonResponse.status, 400);
  assert.equal((await badJsonResponse.json()).code, "INVALID_INPUT");

  const negativeMetricResponse = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "-5" } }),
    VIDEO_ID,
    deps,
  );
  assert.equal(negativeMetricResponse.status, 400);
  assert.equal((await negativeMetricResponse.json()).code, "INVALID_INPUT");

  const nonNumericMetricResponse = await buildPatch24hResponse(
    buildRequest({ metrics: { likes: "abc" } }),
    VIDEO_ID,
    deps,
  );
  assert.equal(nonNumericMetricResponse.status, 400);
  assert.equal((await nonNumericMetricResponse.json()).code, "INVALID_INPUT");
});

test("成功：新增 24h 快照并把「未满24h」更新为「正常」，保留 null 与 0 的区分", async () => {
  const captured: {
    insertedPayload: Record<string, unknown> | null;
    updatedVideoPayload: Record<string, unknown> | null;
  } = {
    insertedPayload: null,
    updatedVideoPayload: null,
  };

  const userClient = {
    from(table: string) {
      if (table === "videos") {
        return {
          select() {
            return {
              eq() { return this; },
              async maybeSingle() {
                return {
                  data: {
                    id: VIDEO_ID,
                    user_id: OWNER_ID,
                    anomaly_status: "未满24h",
                    accounts: { profile_id: OWNER_ID },
                  },
                  error: null,
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            captured.updatedVideoPayload = payload;
            return {
              eq() { return this; },
              select() { return this; },
              async maybeSingle() {
                return { data: { id: VIDEO_ID, anomaly_status: "正常" }, error: null };
              },
            };
          },
        };
      }

      assert.equal(table, "video_metrics_snapshots");
      return {
        select() {
          return {
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() {
              return { data: null, error: null };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          captured.insertedPayload = payload;
          return {
            select() { return this; },
            async maybeSingle() {
              return {
                data: { id: SNAPSHOT_ID, ...payload, captured_at: "2026-11-22T14:00:00.000Z" },
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const response = await buildPatch24hResponse(
    buildRequest({
      snapshotId: null,
      metrics: {
        play_count: "3200",
        likes: "0",
        comments: "",
        shares: "15",
        favorites: "",
        follower_gain: "22",
        follower_loss: "",
        follower_convert: "0",
        avg_play_ratio: "42.5",
      },
    }),
    VIDEO_ID,
    {
      requireAdminActor: async () => buildAuthorizedActor(),
      buildPermissionContextForActor: async () => buildScopeContext(),
      createClient: async () => userClient as never,
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.partialSuccess, false);
  assert.equal(body.snapshotSaved, true);
  assert.equal(body.statusUpdated, true);
  assert.equal(body.video.anomaly_status, "正常");
  assert.equal(captured.insertedPayload?.play_count, 3200);
  assert.equal(captured.insertedPayload?.likes, 0);
  assert.equal(captured.insertedPayload?.comments, null);
  assert.equal(captured.insertedPayload?.follower_convert, 0);
  assert.equal(captured.insertedPayload?.avg_play_ratio, 0.425);
  assert.deepEqual(captured.updatedVideoPayload, { anomaly_status: "正常" });
});

test("部分成功：快照保存成功但视频状态未更新时返回 500 与专属错误码及提示，不伪装成成功", async () => {
  let snapshotUpdatedId: string | null = null;
  let snapshotUpdatedVideoId: string | null = null;

  const userClient = {
    from(table: string) {
      if (table === "videos") {
        return {
          select() {
            return {
              eq() { return this; },
              async maybeSingle() {
                return {
                  data: {
                    id: VIDEO_ID,
                    user_id: OWNER_ID,
                    anomaly_status: "未满24h",
                    accounts: { profile_id: OWNER_ID },
                  },
                  error: null,
                };
              },
            };
          },
          update() {
            return {
              eq() { return this; },
              select() { return this; },
              async maybeSingle() {
                return { data: null, error: { message: "rls denied on videos" } };
              },
            };
          },
        };
      }

      assert.equal(table, "video_metrics_snapshots");
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              if (column === "id") snapshotUpdatedId = value;
              if (column === "video_id") snapshotUpdatedVideoId = value;
              return this;
            },
            select() { return this; },
            async maybeSingle() {
              return {
                data: { id: SNAPSHOT_ID, video_id: VIDEO_ID, ...patch },
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const originalBuilder = defaultPatch24hRouteDeps.buildPatch24hResponse;
  defaultPatch24hRouteDeps.buildPatch24hResponse = (request, videoId, _deps, observation) =>
    originalBuilder(request, videoId, {
      requireAdminActor: async () => buildAuthorizedActor(),
      buildPermissionContextForActor: async () => buildScopeContext(),
      createClient: async () => userClient as never,
    }, observation);

  try {
    const response = await POST(
      buildRequest({
        snapshotId: SNAPSHOT_ID,
        metrics: { play_count: "5000", likes: "120" },
      }),
      { params: Promise.resolve({ videoId: VIDEO_ID }) },
    );

    assert.equal(response.status, 500);
    assert.ok(response.headers.get("x-dydata-request-id"));
    assert.equal(snapshotUpdatedId, SNAPSHOT_ID);
    assert.equal(snapshotUpdatedVideoId, VIDEO_ID);

    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.partialSuccess, true);
    assert.equal(body.snapshotSaved, true);
    assert.equal(body.statusUpdated, false);
    assert.equal(body.code, "PATCH_24H_STATUS_UPDATE_FAILED");
    assert.equal(body.error, "数据已保存，状态未更新，请刷新重试");
  } finally {
    defaultPatch24hRouteDeps.buildPatch24hResponse = originalBuilder;
  }
});

test("快照保存失败时返回 500 且不再更新视频状态", async () => {
  let videoUpdateCalled = false;

  const userClient = {
    from(table: string) {
      if (table === "videos") {
        return {
          select() {
            return {
              eq() { return this; },
              async maybeSingle() {
                return {
                  data: {
                    id: VIDEO_ID,
                    user_id: OWNER_ID,
                    anomaly_status: "未满24h",
                    accounts: { profile_id: OWNER_ID },
                  },
                  error: null,
                };
              },
            };
          },
          update() {
            videoUpdateCalled = true;
            throw new Error("快照失败后不应更新视频状态");
          },
        };
      }

      return {
        select() {
          return {
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() {
              return { data: null, error: null };
            },
          };
        },
        insert() {
          return {
            select() { return this; },
            async maybeSingle() {
              return { data: null, error: { message: "insert failed" } };
            },
          };
        },
      };
    },
  };

  const response = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "1000" } }),
    VIDEO_ID,
    {
      requireAdminActor: async () => buildAuthorizedActor(),
      buildPermissionContextForActor: async () => buildScopeContext(),
      createClient: async () => userClient as never,
    },
  );

  assert.equal(response.status, 500);
  assert.equal(videoUpdateCalled, false);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.partialSuccess, false);
  assert.equal(body.snapshotSaved, false);
  assert.equal(body.statusUpdated, false);
});
