import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildAdminContentDetailResponse } from "./[videoId]/route";

test("详情接口按请求生命周期加载，并对范围外或不存在的视频返回 404", async () => {
  let requestedLifecycle: string | undefined;
  const response = await buildAdminContentDetailResponse(
    new NextRequest("https://dydata.cc/api/admin/content/video-1?view=trash"),
    "video-1",
    {
      requireAdminActor: async () => ({
        actor: {
          userId: "admin-1",
          role: "admin",
          companyRole: "company_owner",
          permissions: { manage_videos: true, review_content: true },
        },
        context: { scope: { visibleUserIds: ["member-1"] } },
      }) as never,
      buildPermissionContextForActor: async () => null as never,
      resolveReadOnlyCompanyScope: async (_client, scope) => scope as never,
      createAdminClient: () => ({}) as never,
      loadAdminContentVideoDetail: async ({ lifecycleState }) => {
        requestedLifecycle = lifecycleState;
        return null;
      },
    },
  );

  assert.equal(requestedLifecycle, "trashed");
  assert.equal(response.status, 404);
  assert.match(JSON.stringify(await response.json()), /视频不存在/);
});
