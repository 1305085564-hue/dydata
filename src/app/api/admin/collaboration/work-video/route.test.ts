import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildWorkVideoResponse } from "./route-core";

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
    createAdminClient: () => ({}) as never,
    loadScopedReport: async () => ({
      id: REPORT_ID,
      userId: "member-1",
      accountId: "account-1",
      reportDate: "2026-09-07",
    }),
    loadActiveVideosForAccount: async () => [
      {
        id: "video-1",
        userId: "member-1",
        accountId: "account-1",
        publishedAt: "2026-09-06T16:30:00.000Z",
        uploadedAt: null,
        accountOwnerUserId: "member-1",
      },
    ],
    ...overrides,
  } as never;
}

test("缺少视频复盘权限时，不读取日报或视频", async () => {
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
});

test("受限日报的唯一同日视频可打开视频复盘", async () => {
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
        };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { videoId: "video-1" });
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
          publishedAt: "2026-09-06T16:30:00.000Z",
          uploadedAt: null,
          accountOwnerUserId: "member-1",
        },
        {
          id: "video-2",
          userId: "member-1",
          accountId: "account-1",
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
          publishedAt: "2026-09-06T16:30:00.000Z",
          uploadedAt: null,
          accountOwnerUserId: "outside-member",
        },
      ],
    }),
  );

  assert.equal(response.status, 404);
});
