import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentObservationGetResponse,
  buildContentObservationPostResponse,
} from "./route";
import type { ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";

function buildAccess(): ScopedAdminVideoAccess {
  return {
    actor: {
      userId: "server-admin-1",
      role: "admin" as const,
      businessRole: "team_admin" as const,
      permissions: { view_content_review: true },
      name: "负责人",
    },
    scope: {
      userId: "server-admin-1",
      role: "admin" as const,
      businessRole: "team_admin" as const,
      permissions: { view_content_review: true },
      accessLevel: 3 as const,
      teamId: null,
      groupId: null,
      kind: "all" as const,
      visibleUserIds: [],
    },
    supabase: {} as never,
    video: {} as never,
  };
}

test("content-observations GET 复用批改台 scoped video 权限并读取当前管理者记录", async () => {
  let requiredPathname = "";
  const response = await buildContentObservationGetResponse("video-1", {
    requireScopedAdminVideo: async ({ videoId, pathname }) => {
      assert.equal(videoId, "video-1");
      requiredPathname = pathname;
      return buildAccess();
    },
    loadContentObservation: async ({ videoId, observerId }) => {
      assert.equal(videoId, "video-1");
      assert.equal(observerId, "server-admin-1");
      return {
        id: "observation-1",
        video_id: videoId,
        observer_id: observerId,
        traffic_peak_level: "high",
        post_peak_trend: null,
        traffic_retention_quality: null,
        drop_off_stage: null,
        suspected_problem_stage: null,
        note: null,
        created_at: "2026-05-28T11:00:00.000Z",
        updated_at: "2026-05-28T12:00:00.000Z",
      };
    },
    saveContentObservation: async () => {
      throw new Error("should not save in GET");
    },
  });

  assert.equal(requiredPathname, "/admin/content");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.video_id, "video-1");
  assert.equal(payload.observation.observer_id, "server-admin-1");
});

test("content-observations POST 不信任前端 observer_id", async () => {
  const response = await buildContentObservationPostResponse(
    {
      video_id: "video-1",
      observer_id: "client-forged-admin",
      traffic_peak_level: "medium",
    },
    {
      requireScopedAdminVideo: async ({ pathname }) => {
        assert.equal(pathname, "/admin/content");
        return buildAccess();
      },
      loadContentObservation: async () => null,
      saveContentObservation: async ({ videoId, observerId, input }) => {
        assert.equal(videoId, "video-1");
        assert.equal(observerId, "server-admin-1");
        assert.equal((input as Record<string, unknown>).observer_id, "client-forged-admin");
        return {
          id: "observation-1",
          video_id: videoId,
          observer_id: observerId,
          traffic_peak_level: "medium",
          post_peak_trend: null,
          traffic_retention_quality: null,
          drop_off_stage: null,
          suspected_problem_stage: null,
          note: null,
          created_at: "2026-05-28T11:00:00.000Z",
          updated_at: "2026-05-28T12:00:00.000Z",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.observation.observer_id, "server-admin-1");
});

test("content-observations POST 把校验错误返回 400", async () => {
  const response = await buildContentObservationPostResponse(
    {
      videoId: "video-1",
      traffic_peak_level: "wrong",
    },
    {
      requireScopedAdminVideo: async () => buildAccess(),
      loadContentObservation: async () => null,
      saveContentObservation: async () => {
        throw new Error("traffic_peak_level 枚举值不正确");
      },
    },
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "traffic_peak_level 枚举值不正确");
});
