import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { defaultVideoLifecycleDeps, PATCH } from "./route";

test("video lifecycle 业务失败时返回明确错误和分层字段", async () => {
  const original = defaultVideoLifecycleDeps.performVideoLifecycleAction;
  defaultVideoLifecycleDeps.performVideoLifecycleAction = async () => ({ ok: false, status: 409, error: "状态冲突" }) as never;
  try {
    const request = new NextRequest("https://dydata.cc/api/admin/videos/video-1/lifecycle", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "trash" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ videoId: "video-1" }) });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.error, "状态冲突");
  } finally {
    defaultVideoLifecycleDeps.performVideoLifecycleAction = original;
  }
});
