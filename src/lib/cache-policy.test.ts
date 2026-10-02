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
