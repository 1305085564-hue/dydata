import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildTopicLibraryStatusPostResponse } from "./route";

test("topic-library-status 真 handler：鉴权失败返回分层字段", async () => {
  const response = await buildTopicLibraryStatusPostResponse(
    new NextRequest("https://dydata.cc/api/admin/content/topic-library-status", { method: "POST", body: "{}" }),
    {
      requireAdminActor: async () => ({ error: "无权限", status: 403 }) as never,
      buildDataAccessScope: async () => null,
      createAdminClient: () => ({} as never),
      resolveVideoTopicLibraryStatuses: async () => ({}),
    },
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, false);
  assert.equal(body.error, "无权限");
});
