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

test("content-analysis 依赖抛错时返回明确 500、脱敏文案、requestId 和分层字段", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await buildContentAnalysisResponse(request({ video_id: "video-1" }), {
      requireScopedAdminVideo: async () => { throw new Error('relation "videos" timeout'); },
      generateContentAnalysisForAccess: async () => ({} as never),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.businessSucceeded, false);
    assert.ok(typeof body.requestId === "string" && body.requestId.length > 0);
    assert.match(body.error, /^加载视频失败（编号：/);
    assert.doesNotMatch(body.error, /relation|videos|timeout/);
    assert.equal(body.auditStatus, "skipped");

    const aiFail = await buildContentAnalysisResponse(request({ video_id: "video-1" }), {
      requireScopedAdminVideo: async () => ({ video: { id: "video-1" } } as never),
      generateContentAnalysisForAccess: async () => { throw new Error("upstream 502 raw json"); },
    });
    assert.equal(aiFail.status, 500);
    const aiBody = await aiFail.json();
    assert.equal(aiBody.code, "CONTENT_ANALYSIS_FAILED");
    assert.ok(typeof aiBody.requestId === "string" && aiBody.requestId.length > 0);
    assert.match(aiBody.error, /^辅助分析失败（编号：/);
    assert.doesNotMatch(aiBody.error, /upstream 502|raw json/);
  } finally {
    console.error = originalError;
  }
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
