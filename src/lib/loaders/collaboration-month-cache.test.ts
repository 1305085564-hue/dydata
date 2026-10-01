import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCollaborationMonthCache,
  loadCachedCollaborationMonthDataset,
} from "./collaboration-month-cache";

const input = {
  supabase: {} as never,
  visibleUserIds: ["user-2", "user-1"],
  range: { year: 2026, month: 9, start: "2026-09-01", end: "2026-09-30" },
};

test("协作月度数据集在同一范围内复用 60 秒结果", async () => {
  clearCollaborationMonthCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { currentRows: [], previousRows: [], historyRows: [], profiles: [], accounts: [], writerCertifications: [], visibleUserIds: [], videoSnapshots: new Map(), videoTopicTags: { state: "ready" as const, tags: new Map() } };
  };

  const first = await loadCachedCollaborationMonthDataset(input, loader);
  const second = await loadCachedCollaborationMonthDataset({ ...input, visibleUserIds: ["user-1", "user-2"] }, loader);

  assert.equal(calls, 1);
  assert.strictEqual(first, second);
});

test("fresh 请求跳过协作月度缓存", async () => {
  clearCollaborationMonthCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { currentRows: [], previousRows: [], profiles: [], accounts: [], writerCertifications: [], visibleUserIds: [], videoSnapshots: new Map(), videoTopicTags: { state: "ready" as const, tags: new Map() } };
  };

  await loadCachedCollaborationMonthDataset(input, loader);
  await loadCachedCollaborationMonthDataset({ ...input, fresh: true }, loader);

  assert.equal(calls, 2);
});
