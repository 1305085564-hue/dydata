import assert from "node:assert/strict";
import test from "node:test";

import { buildSingleVideoInsightResponse } from "./route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";

test("单视频 AI 不会分析不属于当前用户的内容", async () => {
  let ranInsight = false;
  const response = await buildSingleVideoInsightResponse(
    new Request("https://dydata.cc/api/ai/insight/single-video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: VIDEO_ID }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsContentItem: async () => false,
      runInsight: async () => {
        ranInsight = true;
        return {} as never;
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(ranInsight, false);
});

test("单视频 AI 拒绝非 UUID 的 video_id", async () => {
  const response = await buildSingleVideoInsightResponse(
    new Request("https://dydata.cc/api/ai/insight/single-video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: "not-a-uuid" }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsContentItem: async () => true,
      runInsight: async () => ({} as never),
    },
  );

  assert.equal(response.status, 400);
});
