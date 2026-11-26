import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollaborationTabDataCacheKey,
  clearCollaborationTabDataCache,
  readCollaborationTabData,
  writeCollaborationTabData,
  __internal,
} from "./collaboration-tab-cache";

test("协作页签缓存键同时包含权限范围、年月和页签", () => {
  const key = buildCollaborationTabDataCacheKey("scope-a", 2026, 11, "writers");
  assert.notEqual(buildCollaborationTabDataCacheKey("scope-b", 2026, 11, "writers"), key);
  assert.notEqual(buildCollaborationTabDataCacheKey("scope-a", 2026, 12, "writers"), key);
  assert.notEqual(buildCollaborationTabDataCacheKey("scope-a", 2026, 11, "talents"), key);
  assert.equal(buildCollaborationTabDataCacheKey("scope-a", 2026, 11, "writers"), key);
  assert.equal(__internal.TAB_DATA_TTL_MS, 60_000);
});

test("翻月重挂后回访同月页签仍命中缓存，其它页签互不串数据", () => {
  clearCollaborationTabDataCache();
  const writers = { tab: "writers" } as never;
  writeCollaborationTabData("scope-a", 2026, 11, "writers", writers);

  // 模拟翻到 12 月再翻回 11 月：模块级缓存不随组件重挂清空。
  assert.strictEqual(readCollaborationTabData("scope-a", 2026, 11, "writers"), writers);
  assert.equal(readCollaborationTabData("scope-a", 2026, 11, "talents"), undefined);
  assert.equal(readCollaborationTabData("scope-a", 2026, 12, "writers"), undefined);

  clearCollaborationTabDataCache();
  assert.equal(readCollaborationTabData("scope-a", 2026, 11, "writers"), undefined);
});
