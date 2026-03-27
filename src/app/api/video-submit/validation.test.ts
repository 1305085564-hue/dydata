import test from "node:test";
import assert from "node:assert/strict";

import { normalizeContentKeywords, validateVideoSubmitPayload } from "./validation.ts";

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
