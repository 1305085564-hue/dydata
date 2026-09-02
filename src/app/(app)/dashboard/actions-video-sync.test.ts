import assert from "node:assert/strict";
import test from "node:test";

import { isHistoryVideoSyncFailure } from "@/lib/history-video-sync";

test("历史编辑视频更新 0 行时视为同步失败", () => {
  assert.equal(isHistoryVideoSyncFailure("video-1", { data: null, error: null }), true);
});

test("历史编辑视频更新命中时不视为同步失败", () => {
  assert.equal(isHistoryVideoSyncFailure("video-1", { data: { id: "video-1" }, error: null }), false);
});

test("新建日报没有原视频编号时不因未返回视频数据失败", () => {
  assert.equal(isHistoryVideoSyncFailure(null, { data: null, error: null }), false);
});
