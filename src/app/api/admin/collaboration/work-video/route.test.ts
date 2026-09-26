import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildWorkVideoResponse, WORK_VIDEO_FORBIDDEN_MESSAGE } from "./route-core";

const REPORT_ID = "123e4567-e89b-42d3-a456-426614174001";

function buildRequest() {
  return new NextRequest(`https://dydata.cc/api/admin/collaboration/work-video?reportId=${REPORT_ID}`);
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    requireAdminActor: async () => ({
      supabase: {} as never,
      actor: {
        userId: "actor-1",
        role: "admin" as const,
        permissions: { review_content: true },
        name: "管理员",
        dataScope: "team" as const,
        teamId: "team-1",
      },
    }),
    buildPermissionContextForActor: async () => ({
      permissionInfo: {} as never,
      scope: {
        kind: "team" as const,
        visibleUserIds: ["member-1"],
      } as never,
    }),
    resolveCollaborationScope: async () => ({
      visibleUserIds: ["member-1"],
      activeVisibleUserIds: ["member-1"],
      restrictToSelf: false,
    }),
    createAdminClient: () => ({}) as never,
    loadScopedReport: async () => ({
      id: REPORT_ID,
      userId: "member-1",
      accountId: "account-1",
      reportDate: "2026-09-07",
      videoId: null,
      title: "测试作品",
    }),
    loadActiveVideosForAccount: async () => [
      {
        id: "video-1",
        userId: "member-1",
        accountId: "account-1",
        title: "测试作品",
        publishedAt: "2026-09-06T16:30:00.000Z",
        uploadedAt: null,
        accountOwnerUserId: "member-1",
      },
    ],
    loadAdminContentVideoDetail: async () => ({
      video: { id: "video-1", video_title: "测试作品" },
      snapshot: { id: "snapshot-1", play_count: 10000 },
      reviewReadiness: {},
      topicKind: "review",
    }),
    ...overrides,
  } as never;
}

test("缺少视频复盘权限时，不读取日报或视频，并给出可理解的提示", async () => {
  let reportRead = false;
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "actor-1",
          role: "admin" as const,
          permissions: { view_analytics: true },
          name: "管理员",
          dataScope: "team" as const,
        },
      }),
      loadScopedReport: async () => {
        reportRead = true;
        return null;
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(reportRead, false);
  assert.deepEqual(await response.json(), { error: WORK_VIDEO_FORBIDDEN_MESSAGE });
  assert.equal(WORK_VIDEO_FORBIDDEN_MESSAGE, "当前账号不能查看此作品复盘");
});

test("组员凭作品复盘只读键可打开本公司作品，范围来自数据管理解析结果", async () => {
  let receivedVisibleUserIds: string[] | null = null;
  let receivedScopeVisibleIds: string[] | null = null;
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "member-me",
          role: "member" as const,
          permissions: { view_analytics: true, export_data: true, view_video_review: true },
          name: "组员",
          dataScope: "self" as const,
          teamId: "team-1",
        },
      }),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: {
          kind: "self" as const,
          visibleUserIds: ["member-me"],
        } as never,
      }),
      resolveCollaborationScope: async () => ({
        visibleUserIds: ["member-me", "colleague-1"],
        activeVisibleUserIds: ["member-me", "colleague-1"],
        restrictToSelf: false,
      }),
      loadScopedReport: async (_supabase: unknown, _reportId: string, visibleUserIds: string[]) => {
        receivedVisibleUserIds = visibleUserIds;
        return {
          id: REPORT_ID,
          userId: "colleague-1",
          accountId: "account-1",
          reportDate: "2026-09-07",
          videoId: "video-bound",
          title: "同事作品",
        };
      },
      loadActiveVideosForAccount: async () => [],
      loadAdminContentVideoDetail: async (input: unknown) => {
        receivedScopeVisibleIds = (input as { scope: { visibleUserIds: string[] } }).scope.visibleUserIds;
        return {
          video: { id: "video-bound", account_id: "account-1", video_title: "同事作品" },
          snapshot: null,
          reviewReadiness: {},
          topicKind: "review",
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedVisibleUserIds, ["member-me", "colleague-1"]);
  // 作品归属校验必须吃同一个本公司范围，否则组员点了同事作品依旧 404
  assert.deepEqual(receivedScopeVisibleIds, ["member-me", "colleague-1"]);
  assert.equal((await response.json()).videoId, "video-bound");
});

test("组员无公司归属时范围降级为只看自己，打不开同事作品", async () => {
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "member-me",
          role: "member" as const,
          permissions: { view_video_review: true },
          name: "组员",
          dataScope: "self" as const,
        },
      }),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: { kind: "self" as const, visibleUserIds: ["member-me"] } as never,
      }),
      resolveCollaborationScope: async () => ({
        visibleUserIds: ["member-me"],
        activeVisibleUserIds: ["member-me"],
        restrictToSelf: true,
      }),
      loadScopedReport: async () => null,
    }),
  );

  assert.equal(response.status, 404);
});

test("受限日报的唯一同日视频可打开视频复盘并返回详情", async () => {
  let receivedVisibleUserIds: string[] | null = null;
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      loadScopedReport: async (_supabase: unknown, _reportId: string, visibleUserIds: string[]) => {
        receivedVisibleUserIds = visibleUserIds;
        return {
          id: REPORT_ID,
          userId: "member-1",
          accountId: "account-1",
          reportDate: "2026-09-07",
          videoId: null,
          title: "测试作品",
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    videoId: "video-1",
    video: { id: "video-1", video_title: "测试作品" },
    snapshot: { id: "snapshot-1", play_count: 10000 },
    reviewReadiness: {},
    topicKind: "review",
  });
  assert.deepEqual(receivedVisibleUserIds, ["member-1"]);
});

test("同账号同日多条视频返回冲突，不能随意打开一条", async () => {
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      loadActiveVideosForAccount: async () => [
        {
          id: "video-1",
          userId: "member-1",
          accountId: "account-1",
          title: "测试作品 A",
          publishedAt: "2026-09-06T16:30:00.000Z",
          uploadedAt: null,
          accountOwnerUserId: "member-1",
        },
        {
          id: "video-2",
          userId: "member-1",
          accountId: "account-1",
          title: "测试作品 B",
          publishedAt: null,
          uploadedAt: "2026-09-06T17:30:00.000Z",
          accountOwnerUserId: "member-1",
        },
      ],
    }),
  );

  assert.equal(response.status, 409);
  const payload = await response.json() as { error?: string };
  assert.match(payload.error ?? "", /2 条视频/);
  assert.match(payload.error ?? "", /内容中心/);
});

test("超出视频范围的候选不返回给当前用户", async () => {
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      loadActiveVideosForAccount: async () => [
        {
          id: "video-outside-scope",
          userId: "outside-member",
          accountId: "account-1",
          title: "测试作品",
          publishedAt: "2026-09-06T16:30:00.000Z",
          uploadedAt: null,
          accountOwnerUserId: "outside-member",
        },
      ],
    }),
  );

  assert.equal(response.status, 404);
});

test("日报已有 video_id 时直接打开绑定视频，不因同账号同日多视频返回冲突", async () => {
  let activeVideosRead = false;
  let receivedVideoId: string | null = null;
  const response = await buildWorkVideoResponse(
    buildRequest(),
    buildDeps({
      loadScopedReport: async () => ({
        id: REPORT_ID,
        userId: "member-1",
        accountId: "account-1",
        reportDate: "2026-09-07",
        videoId: "video-bound",
        title: "日报标题",
      }),
      loadActiveVideosForAccount: async () => {
        activeVideosRead = true;
        return [];
      },
      loadAdminContentVideoDetail: async (_input: unknown) => {
        receivedVideoId = (_input as { videoId: string }).videoId;
        return {
          video: { id: "video-bound", account_id: "account-1", video_title: "绑定作品" },
          snapshot: null,
          reviewReadiness: {},
          topicKind: "review",
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(activeVideosRead, false);
  assert.equal(receivedVideoId, "video-bound");
  assert.deepEqual(await response.json(), {
    videoId: "video-bound",
    video: { id: "video-bound", account_id: "account-1", video_title: "绑定作品" },
    snapshot: null,
    reviewReadiness: {},
    topicKind: "review",
  });
});
