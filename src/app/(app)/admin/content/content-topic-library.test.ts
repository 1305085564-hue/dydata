import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicLibraryStatusSignature,
  mergeTopicLibraryStatusPayloads,
  shouldLoadTopicLibraryStatus,
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

test("首屏同一批视频连来两次只发一次请求（审计 M2：此前 12 批发 6 批白跑）", () => {
  const signature = buildTopicLibraryStatusSignature([{ id: "video-1" }, { id: "video-2" }]);

  // 第一次：没加载过、也没有在途 → 发
  assert.equal(shouldLoadTopicLibraryStatus(signature, null, null), true);

  // 第二次 effect 触发时，第一批还没回来（pending 已记录）→ 必须跳过，
  // 否则会把在途请求 abort 掉再原样重发一遍
  assert.equal(shouldLoadTopicLibraryStatus(signature, null, signature), false);

  // 第一批成功落地后（loaded 已记录）→ 依然跳过，不重复取数
  assert.equal(shouldLoadTopicLibraryStatus(signature, signature, null), false);
});

test("列表真的变了仍然会重新取数（不能为了去重把该刷的刷掉）", () => {
  const loaded = buildTopicLibraryStatusSignature([{ id: "video-1" }]);
  const next = buildTopicLibraryStatusSignature([{ id: "video-1" }, { id: "video-2" }]);

  assert.equal(shouldLoadTopicLibraryStatus(next, loaded, null), true);
  // 在途的是旧签名，新签名仍要发（切换视角/筛选后必须更新状态）
  assert.equal(shouldLoadTopicLibraryStatus(next, loaded, loaded), true);
});
