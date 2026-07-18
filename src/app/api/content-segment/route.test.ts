import assert from "node:assert/strict";
import test from "node:test";

import { buildContentSegmentResponse } from "./route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";

test("内容切段不会读取或覆盖他人视频", async () => {
  let built = false;
  let saved = false;
  const response = await buildContentSegmentResponse(
    new Request("https://dydata.cc/api/content-segment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: VIDEO_ID, content: "客户端直接携带的文案" }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsVideo: async () => false,
      buildSegments: async () => {
        built = true;
        return {} as never;
      },
      saveSegments: async () => {
        saved = true;
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(built, false);
  assert.equal(saved, false);
});

test("内容切段拒绝过长文案和超长时长", async () => {
  const deps = {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    }) as never,
    userOwnsVideo: async () => true,
    buildSegments: async () => ({} as never),
    saveSegments: async () => undefined,
  };

  const longContent = await buildContentSegmentResponse(
    new Request("https://dydata.cc/api/content-segment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "a".repeat(50_001) }),
    }) as never,
    deps,
  );
  assert.equal(longContent.status, 400);

  const longDuration = await buildContentSegmentResponse(
    new Request("https://dydata.cc/api/content-segment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "ok", duration_sec: 3_601 }),
    }) as never,
    deps,
  );
  assert.equal(longDuration.status, 400);
});
