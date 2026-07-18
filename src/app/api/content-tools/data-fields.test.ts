import test from "node:test";
import assert from "node:assert/strict";

import { MARKET_CONTEXT_SELECT, SNAPSHOT_SELECT, VIDEO_TAG_SELECT } from "./data-fields";

test("内容工具只加载计算与提示词需要的字段", () => {
  for (const fields of [MARKET_CONTEXT_SELECT, SNAPSHOT_SELECT, VIDEO_TAG_SELECT]) {
    assert.doesNotMatch(fields, /\*/);
  }
  assert.equal(SNAPSHOT_SELECT, "video_id, play_count");
  assert.equal(VIDEO_TAG_SELECT, "video_id, tag_dimension, tag_value");
});
