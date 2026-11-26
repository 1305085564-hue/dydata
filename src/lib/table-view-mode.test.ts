import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLABORATION_DETAIL_MODE_KEY,
  CONTENT_METRIC_VIEW_MODE_KEY,
  readPersistedMode,
  writePersistedMode,
} from "./table-view-mode";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("协作管理与数据复盘默认均为完整视图，未持久化或非法值安全回落 full", () => {
  const storage = createMemoryStorage({
    [COLLABORATION_DETAIL_MODE_KEY]: "invalid",
  });
  assert.equal(
    readPersistedMode(COLLABORATION_DETAIL_MODE_KEY, ["full", "concise"] as const, "full", storage),
    "full",
  );
  assert.equal(
    readPersistedMode(CONTENT_METRIC_VIEW_MODE_KEY, ["full", "spacious"] as const, "full", storage),
    "full",
  );
});

test("切换简洁后持久化读取仍为简洁，再切回完整后仍为完整，且两页互不干扰", () => {
  const storage = createMemoryStorage();

  // 协作管理切到简洁，数据复盘保持默认完整
  writePersistedMode(COLLABORATION_DETAIL_MODE_KEY, "concise", storage);
  assert.equal(
    readPersistedMode(COLLABORATION_DETAIL_MODE_KEY, ["full", "concise"] as const, "full", storage),
    "concise",
  );
  assert.equal(
    readPersistedMode(CONTENT_METRIC_VIEW_MODE_KEY, ["full", "spacious"] as const, "full", storage),
    "full",
  );

  // 数据复盘切到简洁，两者独立保留
  writePersistedMode(CONTENT_METRIC_VIEW_MODE_KEY, "spacious", storage);
  assert.equal(
    readPersistedMode(CONTENT_METRIC_VIEW_MODE_KEY, ["full", "spacious"] as const, "full", storage),
    "spacious",
  );

  // 协作管理切回完整，数据复盘仍为简洁
  writePersistedMode(COLLABORATION_DETAIL_MODE_KEY, "full", storage);
  assert.equal(
    readPersistedMode(COLLABORATION_DETAIL_MODE_KEY, ["full", "concise"] as const, "full", storage),
    "full",
  );
  assert.equal(
    readPersistedMode(CONTENT_METRIC_VIEW_MODE_KEY, ["full", "spacious"] as const, "full", storage),
    "spacious",
  );
});

test("localStorage 异常时降级到内存兜底，不抛出未捕获异常", () => {
  const brokenStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  writePersistedMode("dydata:test:broken", "concise", brokenStorage);
  assert.equal(
    readPersistedMode("dydata:test:broken", ["full", "concise"] as const, "full", brokenStorage),
    "concise",
  );
});
