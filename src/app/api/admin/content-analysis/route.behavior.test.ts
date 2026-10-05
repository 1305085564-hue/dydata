import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildContentAnalysisResponse } from "./route";

function request(body: unknown) {
  return new NextRequest("https://dydata.cc/api/admin/content-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("content-analysis 依赖抛错时返回明确 500 和分层字段", async () => {
  const response = await buildContentAnalysisResponse(request({ video_id: "video-1" }), {
    requireScopedAdminVideo: async () => { throw new Error("视频范围查询失败"); },
    generateContentAnalysisForAccess: async () => ({} as never),
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.error, "视频范围查询失败");
  assert.equal(body.auditStatus, "skipped");
});

test("content-analysis 缺视频 id 拒绝且不静默成功", async () => {
  const response = await buildContentAnalysisResponse(request({}), {
    requireScopedAdminVideo: async () => { throw new Error("不应调用"); },
    generateContentAnalysisForAccess: async () => ({} as never),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.error, "缺少 video_id");
});
