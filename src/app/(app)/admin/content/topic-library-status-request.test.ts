import test from "node:test";
import assert from "node:assert/strict";

import { buildTopicLibraryStatusRequest, buildTopicLibraryStatusRequests } from "./topic-library-status-request";

test("400 个视频 ID 通过 POST 正文发送，不进入 URL", () => {
  const videoIds = Array.from(
    { length: 400 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );

  const request = buildTopicLibraryStatusRequest(videoIds);

  assert.equal(request.url, "/api/admin/content/topic-library-status");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.init.body), { videoIds });
  assert.equal(request.url.includes(videoIds[0]), false);
});

test("状态请求去掉空 ID、重复 ID，并限制为 400 条", () => {
  const videoIds = ["video-1", "", " video-1 ", ...Array.from({ length: 405 }, (_, index) => `video-${index + 2}`)];

  const request = buildTopicLibraryStatusRequest(videoIds);
  const payload = JSON.parse(request.init.body) as { videoIds: string[] };

  assert.equal(payload.videoIds.length, 400);
  assert.deepEqual(payload.videoIds.slice(0, 2), ["video-1", "video-2"]);
});

test("全量列表分批请求：每批不超过 400 个 ID 且合并后覆盖全部视频", () => {
  const videoIds = Array.from({ length: 1820 }, (_, index) => `video-${index}`);

  const requests = buildTopicLibraryStatusRequests(videoIds);
  const merged = requests.flatMap(
    (request) => (JSON.parse(request.init.body) as { videoIds: string[] }).videoIds,
  );

  assert.equal(requests.length, 5);
  assert.equal(requests.every((request) => (JSON.parse(request.init.body) as { videoIds: string[] }).videoIds.length <= 400), true);
  // 不重不漏：第 401 名之后的视频必须也能拿到状态（否则徽标缺失、筛选漏数据）
  assert.equal(merged.length, 1820);
  assert.equal(new Set(merged).size, 1820);
});
