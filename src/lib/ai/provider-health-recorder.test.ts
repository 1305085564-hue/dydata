import assert from "node:assert/strict";
import test from "node:test";

import { recordProviderFailure } from "./provider-health-recorder";

type RpcCall = { fn: string; args: Record<string, unknown> };

function fakeService() {
  const calls: RpcCall[] = [];
  return {
    calls,
    service: {
      from() {
        throw new Error("recordProviderFailure 不应读取配置表");
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return { error: null };
      },
    },
  };
}

test("R3 真实调用记录：模型 404 只写可恢复模型故障", async () => {
  const { calls, service } = fakeService();
  await recordProviderFailure({
    service: service as never,
    providerKeyId: "key-1",
    providerKeyModelId: "supply-1",
    errorType: "http_404",
    message: "model_not_found",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.fn, "record_ai_supply_failure");
  assert.equal(calls[0]?.args.failure_scope, "model");
  assert.equal(calls[0]?.args.permanent_failure, false);
  assert.equal(calls[0]?.args.failure_kind, "other");
});

test("R3 真实调用记录：503 和超时只写可恢复模型故障", async () => {
  for (const input of [
    { errorType: "http_503", message: "model unavailable" },
    { errorType: "timeout", message: "request timed out" },
  ]) {
    const { calls, service } = fakeService();
    await recordProviderFailure({
      service: service as never,
      providerKeyId: "key-1",
      providerKeyModelId: "supply-1",
      ...input,
    });
    assert.equal(calls[0]?.args.failure_scope, "model");
    assert.equal(calls[0]?.args.permanent_failure, false);
  }
});

test("R3 真实调用记录：Key 级明确鉴权失败仍写永久失效", async () => {
  const { calls, service } = fakeService();
  await recordProviderFailure({
    service: service as never,
    providerKeyId: "key-1",
    providerKeyModelId: "supply-1",
    errorType: "http_401",
    message: "invalid api key",
  });
  assert.equal(calls[0]?.args.failure_scope, "key");
  assert.equal(calls[0]?.args.permanent_failure, true);
});

test("R3 真实调用记录：额度故障不升格为永久", async () => {
  const { calls, service } = fakeService();
  await recordProviderFailure({
    service: service as never,
    providerKeyId: "key-1",
    providerKeyModelId: "supply-1",
    errorType: "http_402",
    message: "insufficient quota",
  });
  assert.equal(calls[0]?.args.failure_scope, "key");
  assert.equal(calls[0]?.args.permanent_failure, false);
});
