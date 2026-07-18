import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoTagsConfirmResponse } from "./route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";
const VALID_TAGS = [
  { tag_dimension: "题材", tag_value: "大盘复盘", confidence: 0.8, reason: "复盘大盘" },
];

test("标签确认不会修改他人视频", async () => {
  const response = await buildVideoTagsConfirmResponse(
    new Request("https://dydata.cc/api/video-tags/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: VIDEO_ID, tags: VALID_TAGS, action: "confirm" }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsVideo: async () => false,
    },
  );

  assert.equal(response.status, 403);
});

test("标签确认拒绝非 UUID 视频和过大标签数组", async () => {
  const deps = {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    }) as never,
    userOwnsVideo: async () => true,
  };

  const invalidId = await buildVideoTagsConfirmResponse(
    new Request("https://dydata.cc/api/video-tags/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: "bad", tags: VALID_TAGS, action: "confirm" }),
    }) as never,
    deps,
  );
  assert.equal(invalidId.status, 400);

  const tooManyTags = await buildVideoTagsConfirmResponse(
    new Request("https://dydata.cc/api/video-tags/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: VIDEO_ID, tags: Array.from({ length: 21 }, () => VALID_TAGS[0]), action: "confirm" }),
    }) as never,
    deps,
  );
  assert.equal(tooManyTags.status, 400);
});
