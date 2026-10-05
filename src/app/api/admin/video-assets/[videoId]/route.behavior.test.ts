import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { PATCH } from "./route";

test("video-assets PATCH 已下线时明确返回 410 与分层字段", async () => {
  const request = new NextRequest("https://dydata.cc/api/admin/video-assets/video-1", { method: "PATCH" });
  const response = await PATCH(request, { params: Promise.resolve({ videoId: "video-1" }) });
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.auditStatus, "skipped");
  assert.match(body.error, /已下线/);
});
