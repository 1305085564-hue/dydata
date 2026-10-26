import assert from "node:assert/strict";
import test from "node:test";
import { reportScreenshotReadFailure } from "./screenshot-read-observability";
import { sanitizeSentryEvent } from "./sentry/privacy";

test("长期错误记录保留具体错误类型与关联编号，隐私过滤后仍可排查", () => {
  const records: unknown[] = [];
  let sent: Record<string, unknown> = {};
  reportScreenshotReadFailure({
    requestId: "11111111-1111-4111-8111-111111111111", imageKey: "image-hash", mode: "fast", authMs: 0,
    failure: { kind: "network", code: "ECONNRESET", phase: "headers", attempts: 2 },
  }, {
    log: (record) => { records.push(record); },
    capture: (error, context) => { sent = sanitizeSentryEvent({ exception: { values: [{ type: error.name, value: error.message }] }, ...context }); },
  });
  assert.match(JSON.stringify(sent), /ECONNRESET/);
  assert.match(JSON.stringify(sent), /11111111-1111-4111-8111-111111111111/);
  assert.match(JSON.stringify(records), /headers/);
  assert.doesNotMatch(JSON.stringify(sent), /image-hash/);
});

test("上报失败不能拖垮图片响应；不向错误平台发送原始错误正文", () => {
  assert.doesNotThrow(() => reportScreenshotReadFailure({
    requestId: "11111111-1111-4111-8111-111111111111", imageKey: "safe-hash", mode: "slow", authMs: 12,
    failure: { kind: "unknown", code: null, phase: "headers", attempts: 1 },
  }, { log: () => { throw new Error("logger broken"); }, capture: () => { throw new Error("capture broken"); } }));
});
