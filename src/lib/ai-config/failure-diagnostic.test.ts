import assert from "node:assert/strict";
import test from "node:test";
import { describeChannelFailure } from "./failure-diagnostic";

test("故障归属区分服务商、模型权限与我方凭据额度", () => {
  assert.equal(describeChannelFailure({ message: "HTTP 503 unavailable" }).owner, "provider");
  assert.equal(describeChannelFailure({ message: "Cloudflare 1010", status: 403 }).owner, "provider");
  assert.equal(describeChannelFailure({ message: "insufficient_user_quota", status: 403 }).category, "quota");
  assert.equal(describeChannelFailure({ message: "model not found", status: 404 }).category, "model_access");
  assert.equal(describeChannelFailure({ message: "unsupported model: vision", status: 403 }).category, "model_access");
  assert.equal(describeChannelFailure({ message: "unauthorized", status: 401 }).owner, "configuration");
  assert.equal(describeChannelFailure({ message: "insufficient quota", status: 402 }).category, "quota");
  assert.equal(describeChannelFailure({ message: "unexpected response" }).owner, "unknown");
});

test("技术详情保留请求号和状态码并隐藏凭据", () => {
  const result = describeChannelFailure({ message: "Bearer top-secret HTTP 503", requestId: "request-123", secrets: ["top-secret"] });
  assert.equal(result.technical.status, 503); assert.equal(result.technical.requestId, "request-123");
  assert.ok(!JSON.stringify(result).includes("top-secret"));
});
