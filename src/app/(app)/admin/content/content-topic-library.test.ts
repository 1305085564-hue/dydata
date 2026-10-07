import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicLibraryStatusSignature,
  mergeTopicLibraryStatusPayloads,
} from "./content-topic-library";

test("选题库状态签名与视频顺序无关，重复列表不会重复请求", () => {
  const first = [
    { id: "video-2" },
    { id: "video-1" },
  ];
  const second = [
    { id: "video-1" },
    { id: "video-2" },
  ];

  assert.equal(buildTopicLibraryStatusSignature(first), "video-1,video-2");
  assert.equal(buildTopicLibraryStatusSignature(first), buildTopicLibraryStatusSignature(second));
});

test("选题库分批响应合并时保留所有批次状态", () => {
  const merged = mergeTopicLibraryStatusPayloads([
    { statuses: { "video-1": { status: "in_library", subTopicId: "topic-1", topicKind: "dry_goods" } } },
    { statuses: { "video-2": { status: "removed", subTopicId: "topic-2", topicKind: "review" } } },
    null,
  ]);

  assert.deepEqual(Object.keys(merged).sort(), ["video-1", "video-2"]);
  assert.equal(merged["video-1"]?.subTopicId, "topic-1");
  assert.equal(merged["video-2"]?.status, "removed");
});
