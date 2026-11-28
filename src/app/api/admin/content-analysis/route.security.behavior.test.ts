import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildContentAnalysisResponse } from "./route";
import { fixedPermissionsForRole } from "@/lib/company-permissions";

test("辅助分析拒绝空请求体，不进入权限查询或分析写入", async () => {
  const response = await buildContentAnalysisResponse(new NextRequest("https://dydata.cc/api/admin/content-analysis", {
    method: "POST", body: "null",
  }), {
    requireScopedAdminVideo: async () => assert.fail("非法输入不能进入数据查询"),
    generateContentAnalysisForAccess: async () => assert.fail("非法输入不能写入"),
  });
  assert.equal(response.status, 400);
});

test("辅助分析是写入：组员、跨团队或归档目标拒绝；本团队管理者正常生成", async () => {
  let writes = 0;
  for (const scenario of [
    { role: "member", activeIds: ["author"], expected: 403 },
    { role: "admin", activeIds: ["other-team"], expected: 403 },
    { role: "company_owner", activeIds: [], expected: 403 },
    { role: "admin", activeIds: ["author"], expected: 200 },
    { role: "company_owner", activeIds: ["author"], expected: 200 },
  ] as const) {
    const response = await buildContentAnalysisResponse(new NextRequest("https://dydata.cc/api/admin/content-analysis", {
      method: "POST", body: JSON.stringify({ video_id: "synthetic-video" }),
    }), {
      requireScopedAdminVideo: async () => ({
        actor: { permissions: fixedPermissionsForRole(scenario.role) },
        video: { id: "synthetic-video", user_id: "uploader", accounts: { profile_id: "author" } },
        scope: { visibleUserIds: ["author"], activeVisibleUserIds: [...scenario.activeIds] },
      }),
      generateContentAnalysisForAccess: async () => { writes++; return { ok: true }; },
    } as unknown as Parameters<typeof buildContentAnalysisResponse>[1]);
    assert.equal(response.status, scenario.expected);
    if (scenario.expected === 403) assert.equal(writes, 0);
  }
  assert.equal(writes, 2);
});
