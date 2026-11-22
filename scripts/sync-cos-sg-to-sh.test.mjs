import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  computeSyncPlan,
  computeVerifyDiff,
  parseListObjectsV2Xml,
  parseSyncArgs,
  pickSampleObjects,
} from "./sync-cos-sg-to-sh.mjs";

test("parseSyncArgs：默认 dry-run，校验互斥参数与增量水位", () => {
  const def = parseSyncArgs([]);
  assert.equal(def.mode, "dry-run");
  assert.equal(def.sample, 50);
  assert.equal(def.concurrency, 8);

  const execInc = parseSyncArgs(["--execute", "--incremental", "--since=2026-11-22T10:00:00Z"]);
  assert.equal(execInc.mode, "execute");
  assert.equal(execInc.incremental, true);
  assert.equal(execInc.since, "2026-11-22T10:00:00Z");

  const verify = parseSyncArgs(["--verify-only", "--sample=25"]);
  assert.equal(verify.mode, "verify-only");
  assert.equal(verify.sample, 25);

  assert.throws(() => parseSyncArgs(["--dry-run", "--execute"]), /不能同时指定/);
  assert.throws(() => parseSyncArgs(["--execute", "--incremental"]), /--since/);
  assert.throws(() => parseSyncArgs(["--execute", "--incremental", "--since=not-a-date"]), /合法 ISO 时间/);
});

test("parseListObjectsV2Xml：正确解析 Key、Size、LastModified、ETag 与分页 Token", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>tok&amp;123</NextContinuationToken>
  <Contents>
    <Key>u1/a1/screenshot_1/foo&amp;bar.png</Key>
    <LastModified>2026-11-22T01:00:00.000Z</LastModified>
    <ETag>&quot;abc123&quot;</ETag>
    <Size>4096</Size>
  </Contents>
  <Contents>
    <Key>u1/a1/screenshot_2/baz.jpg</Key>
    <LastModified>2026-11-22T02:00:00.000Z</LastModified>
    <ETag>"def456"</ETag>
    <Size>8192</Size>
  </Contents>
</ListBucketResult>`;

  const parsed = parseListObjectsV2Xml(xml);
  assert.equal(parsed.isTruncated, true);
  assert.equal(parsed.nextContinuationToken, "tok&123");
  assert.deepEqual(parsed.objects, [
    { key: "u1/a1/screenshot_1/foo&bar.png", size: 4096, lastModified: "2026-11-22T01:00:00.000Z", etag: "abc123" },
    { key: "u1/a1/screenshot_2/baz.jpg", size: 8192, lastModified: "2026-11-22T02:00:00.000Z", etag: "def456" },
  ]);
});

test("computeSyncPlan：幂等跳过同大小已存在对象，仅复制缺失与大小不一致对象", () => {
  const source = [
    { key: "a.png", size: 100, lastModified: "2026-11-20T00:00:00Z" },
    { key: "b.png", size: 200, lastModified: "2026-11-21T00:00:00Z" },
    { key: "c.png", size: 300, lastModified: "2026-11-22T00:00:00Z" },
  ];
  const target = [
    { key: "a.png", size: 100 },
    { key: "b.png", size: 150 },
    { key: "extra.png", size: 999 },
  ];

  const plan = computeSyncPlan(source, target);
  assert.deepEqual(plan.skipped.map((x) => x.key), ["a.png"]);
  assert.deepEqual(
    plan.toCopy.map((x) => ({ key: x.key, reason: x.reason })),
    [
      { key: "b.png", reason: "size_mismatch" },
      { key: "c.png", reason: "missing_in_target" },
    ],
  );

  // 目标桶已完全对齐时，再次计算计划实现 copied=0 幂等
  const idempotent = computeSyncPlan(source, source);
  assert.equal(idempotent.toCopy.length, 0);
  assert.equal(idempotent.skipped.length, 3);
});

test("computeSyncPlan：增量水位过滤只处理 LastModified >= since 的对象", () => {
  const source = [
    { key: "old.png", size: 100, lastModified: "2026-11-22T09:59:59Z" },
    { key: "edge.png", size: 200, lastModified: "2026-11-22T10:00:00Z" },
    { key: "new.png", size: 300, lastModified: "2026-11-22T10:05:00Z" },
  ];
  const plan = computeSyncPlan(source, [{ key: "edge.png", size: 200 }], {
    incremental: true,
    since: "2026-11-22T10:00:00Z",
  });
  assert.equal(plan.scopedTotal, 2);
  assert.deepEqual(plan.skipped.map((x) => x.key), ["edge.png"]);
  assert.deepEqual(plan.toCopy.map((x) => x.key), ["new.png"]);
});

test("computeVerifyDiff 与 pickSampleObjects：准确识别缺失、字节不符与抽样边界", () => {
  const source = [
    { key: "ok1.png", size: 10 },
    { key: "ok2.png", size: 20 },
    { key: "miss.png", size: 30 },
    { key: "diff.png", size: 40 },
  ];
  const target = [
    { key: "ok1.png", size: 10 },
    { key: "ok2.png", size: 20 },
    { key: "diff.png", size: 41 },
    { key: "extra.png", size: 99 },
  ];

  const diff = computeVerifyDiff(source, target);
  assert.equal(diff.matchedCount, 2);
  assert.deepEqual(diff.missing, ["miss.png"]);
  assert.deepEqual(diff.sizeMismatch, [{ key: "diff.png", sourceSize: 40, targetSize: 41 }]);
  assert.deepEqual(diff.extra, ["extra.png"]);

  const sampled = pickSampleObjects(diff.matched, 50);
  assert.equal(sampled.length, 2);
  assert.equal(pickSampleObjects(diff.matched, 1).length, 1);
  assert.equal(pickSampleObjects(diff.matched, 0).length, 0);
});

test("安全边界：同步脚本零删除能力且源桶严格只读", () => {
  const scriptPath = path.resolve("scripts/sync-cos-sg-to-sh.mjs");
  const code = fs.readFileSync(scriptPath, "utf8");
  // 脚本中只能出现针对 DELETE 的拦截守卫，不能存在真实发起 DELETE 的代码路径
  assert.match(code, /readOnly:\s*true/);
  assert.equal(/\.request\(\s*["'`]DELETE["'`]/.test(code), false);
});
