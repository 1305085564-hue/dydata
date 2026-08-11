import assert from "node:assert/strict";
import test from "node:test";

import { buildAttributionResponse } from "../handlers";

const actorId = "123e4567-e89b-42d3-a456-426614174001";
const reportId = "123e4567-e89b-42d3-a456-426614174010";
const targetId = "123e4567-e89b-42d3-a456-426614174002";
const archivedReportOwnerId = "123e4567-e89b-42d3-a456-426614174003";

function request() {
  return new Request("https://dydata.cc/api/admin/collaboration/attribution", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reportId,
      scriptAuthorUserId: targetId,
      videoEditorUserId: targetId,
      operatorUserId: targetId,
    }),
  });
}

function deps(reportOwnerId: string, videoUpdated = false, activeVisibleUserIds?: string[]) {
  let updateCalled = false;
  return {
    value: {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: actorId,
          role: "owner" as const,
          permissions: {},
          name: "老板",
          dataScope: "all" as const,
        },
      }),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: {
          visibleUserIds: [actorId, targetId, reportOwnerId],
          activeVisibleUserIds: activeVisibleUserIds ?? [actorId, targetId, reportOwnerId],
        } as never,
      }),
      createAdminClient: () => ({}) as never,
      loadAttributionReport: async () => ({
        id: reportId,
        user_id: reportOwnerId,
        account_id: "123e4567-e89b-42d3-a456-426614174020",
        report_date: "2026-07-28",
      }),
      assertProfilesExist: async () => true,
      updateAttributionAtomically: async () => {
        updateCalled = true;
        return { videoUpdated };
      },
    },
    wasUpdateCalled: () => updateCalled,
  };
}

test("补录接口拒绝管理员修改自己提交的日报", async () => {
  const injected = deps(actorId);
  const response = await buildAttributionResponse(request(), injected.value);

  assert.equal(response.status, 403);
  assert.equal(injected.wasUpdateCalled(), false);
});

test("视频软配对失败时事务仍成功并明确返回 videoUpdated false", async () => {
  const injected = deps(targetId, false);
  const response = await buildAttributionResponse(request(), injected.value);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    videoUpdated: false,
    message: "暂未匹配到视频，日报已保存，后续可手动关联",
  });
  assert.equal(injected.wasUpdateCalled(), true);
});

test("补录接口保留归档成员历史可见，但拒绝继续修改其日报", async () => {
  const injected = deps(archivedReportOwnerId, false, [actorId, targetId]);
  const response = await buildAttributionResponse(request(), injected.value);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "不能修改已归档或当前权限范围外的日报" });
  assert.equal(injected.wasUpdateCalled(), false);
});
