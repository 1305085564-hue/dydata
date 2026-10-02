import assert from "node:assert/strict";
import test from "node:test";
import { BoundedTtlCache } from "./cache-policy";

test("有界 TTL 缓存隔离命中、过期和淘汰指标", () => {
  let now = 0;
  const cache = new BoundedTtlCache({ scope: "user", ttlMs: 10, maxEntries: 1 }, () => now);
  cache.set("user-a:key", "a");
  assert.equal(cache.get("user-a:key"), "a");
  assert.equal(cache.get("user-b:key"), undefined);
  now = 11;
  assert.equal(cache.get("user-a:key"), undefined);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.size, 1);
  assert.equal(cache.stats.evictions, 1);
  assert.equal(cache.stats.expirations, 1);
});

test("按键前缀批量失效，不依赖外部影子键集合", () => {
  const cache = new BoundedTtlCache({ scope: "user", ttlMs: 100, maxEntries: 10 });
  cache.set("user-a:2026-09", "a");
  cache.set("user-a:2026-08", "a");
  cache.set("user-b:2026-09", "b");

  assert.equal(cache.deleteByPrefix("user-a:"), 2);
  assert.equal(cache.get("user-a:2026-09"), undefined);
  assert.equal(cache.get("user-b:2026-09"), "b");
  assert.equal(cache.stats.invalidations, 2);
});
