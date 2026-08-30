import test from "node:test";
import assert from "node:assert/strict";

import { parseTopicLibraryStatusVideoIds } from "./input";

test("POST 正文接受最多 400 个视频 ID", () => {
  const videoIds = Array.from({ length: 400 }, (_, index) => `video-${index + 1}`);

  assert.deepEqual(parseTopicLibraryStatusVideoIds({ videoIds }), { ok: true, videoIds });
});

test("POST 正文拒绝超出上限和非数组 videoIds", () => {
  const tooMany = Array.from({ length: 401 }, (_, index) => `video-${index + 1}`);

  assert.deepEqual(parseTopicLibraryStatusVideoIds({ videoIds: tooMany }), {
    ok: false,
    error: "单次最多查询 400 个视频",
  });
  assert.deepEqual(parseTopicLibraryStatusVideoIds({ videoIds: "video-1" }), {
    ok: false,
    error: "videoIds 必须是字符串数组",
  });
});
