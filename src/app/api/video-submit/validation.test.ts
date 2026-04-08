import test from "node:test";
import assert from "node:assert/strict";

import { normalizeContentKeywords, validateVideoSubmitPayload } from "./validation.ts";
import { buildStableUuid, buildSubmissionFingerprint, buildSubmissionRecordId } from "./stability.ts";

test("提交接口要求标题、文案、内容标签至少一个", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "",
    content: "  ",
    content_keywords: [],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "标题、文案、内容标签为必填项",
  });
});

test("内容标签会去空格、去重，并最多保留 3 个", () => {
  assert.deepEqual(
    normalizeContentKeywords([" 复盘 ", "情绪", "复盘", "", "热点", "多余标签"]),
    ["复盘", "情绪", "热点"]
  );
});

test("提交校验会返回规范化后的写入数据", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_id: " 123e4567-e89b-12d3-a456-426614174000 ",
    video_url: " https://example.com/video ",
    video_title: " 标题 ",
    content: " 文案 ",
    published_at: "2025-04-08T10:20:30.000Z",
    published_at_text: " 2025-04-08 12:00 ",
    biz_date: "2025-04-08",
    anomaly_status: " 正常 ",
    topic_tag: " 干货 ",
    content_keywords: [" 复盘 ", "热点"],
    assets: [],
    metrics: {
      play_count: 10,
      likes: 2,
      comments: 3,
      shares: 4,
      favorites: 5,
      follower_gain: 6,
      follower_loss: 7,
      follower_convert: 8,
      avg_play_duration: 9,
      bounce_rate_2s: 10,
      completion_rate_5s: 11,
      completion_rate: 12,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.contentKeywords, ["复盘", "热点"]);
  assert.equal(result.normalized.account_id, "acc-1");
  assert.equal(result.normalized.video_id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(result.normalized.video_url, "https://example.com/video");
  assert.equal(result.normalized.video_title, "标题");
  assert.equal(result.normalized.content, "文案");
  assert.equal(result.normalized.published_at_text, "2025-04-08 12:00");
  assert.equal(result.normalized.anomaly_status, "正常");
  assert.equal(result.normalized.topic_tag, "干货");
  assert.equal(result.normalized.metrics.play_count, 10);
});

test("提交幂等 id 对同一份规范化数据保持稳定", () => {
  const base = {
    account_id: "acc-1",
    video_id: null,
    video_url: "https://example.com/video",
    video_title: "标题",
    content: "文案",
    published_at: null,
    published_at_text: null,
    biz_date: "2025-04-08",
    anomaly_status: "正常",
    topic_tag: "干货",
    content_keywords: ["复盘", "热点"],
    assets: [],
    metrics: {
      play_count: 10,
      likes: 2,
      comments: 3,
      shares: 4,
      favorites: 5,
      follower_gain: 6,
      follower_loss: 7,
      follower_convert: 8,
      avg_play_duration: 9,
      bounce_rate_2s: 10,
      completion_rate_5s: 11,
      completion_rate: 12,
    },
  };

  const fingerprintA = buildSubmissionFingerprint(base);
  const fingerprintB = buildSubmissionFingerprint({ ...base, content_keywords: ["热点", "复盘"] });

  assert.equal(fingerprintA, fingerprintB);
  assert.equal(buildSubmissionRecordId(base), buildSubmissionRecordId({ ...base, content_keywords: ["热点", "复盘"] }));
  assert.equal(buildStableUuid(fingerprintA), buildStableUuid(fingerprintA));
});
