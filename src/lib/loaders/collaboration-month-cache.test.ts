import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCollaborationMonthCache,
  invalidateCollaborationTableWrite,
  loadCachedCollaborationMonthDataset,
  __internal,
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
    return { currentRows: [], profiles: [], accounts: [], writerCertifications: [], visibleUserIds: [], videoSnapshots: new Map(), videoTopicTags: { state: "ready" as const, tags: new Map() } };
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
    return { currentRows: [], profiles: [], accounts: [], writerCertifications: [], visibleUserIds: [], videoSnapshots: new Map(), videoTopicTags: { state: "ready" as const, tags: new Map() } };
  };

  await loadCachedCollaborationMonthDataset(input, loader);
  await loadCachedCollaborationMonthDataset({ ...input, fresh: true }, loader);

  assert.equal(calls, 2);
});

test("缓存键隔离权限、月份、页签数据选项和查询范围", () => {
  const base = { ...input, cacheScopeKey: "team-a:owner" };
  const key = __internal.buildCacheKey(base);
  assert.notEqual(__internal.buildCacheKey({ ...base, cacheScopeKey: "team-b:owner" }), key);
  assert.notEqual(__internal.buildCacheKey({ ...base, range: { ...input.range, month: 10, start: "2026-10-01", end: "2026-10-31" } }), key);
  assert.notEqual(__internal.buildCacheKey({ ...base, monthOnly: true }), key);
  assert.notEqual(__internal.buildCacheKey({ ...base, includeWriterCertifications: true }), key);
  assert.notEqual(__internal.buildCacheKey({ ...base, includeWorkGroupRoster: false }), key);
  assert.notEqual(__internal.buildCacheKey({ ...base, candidateProfileIds: ["user-1"] }), key);
  assert.equal(__internal.COLLABORATION_MONTH_CACHE_TTL_MS, 60_000);
});

test("成功的数据写入清除协作缓存，失败写入与只读请求保留缓存", async () => {
  clearCollaborationMonthCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { currentRows: [], profiles: [], accounts: [], writerCertifications: [], visibleUserIds: [], videoSnapshots: new Map(), videoTopicTags: { state: "ready" as const, tags: new Map() } };
  };

  await loadCachedCollaborationMonthDataset(input, loader);
  invalidateCollaborationTableWrite("https://env.example/v1/rdb/rest/daily_reports", "POST", false);
  await loadCachedCollaborationMonthDataset(input, loader);
  assert.equal(calls, 1);

  invalidateCollaborationTableWrite("https://env.example/v1/rdb/rest/daily_reports", "GET", true);
  await loadCachedCollaborationMonthDataset(input, loader);
  assert.equal(calls, 1);

  invalidateCollaborationTableWrite("https://env.example/v1/rdb/rest/daily_reports", "POST", true);
  await loadCachedCollaborationMonthDataset(input, loader);
  assert.equal(calls, 2);
});
