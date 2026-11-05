import assert from "node:assert/strict";
import test from "node:test";

import { assertLoopbackHttpUrl, closeServer, startFakeUpstream } from "./ai-config-local-demo";

test("本地演示只接受 127.0.0.1 字面地址", () => {
  assert.equal(assertLoopbackHttpUrl("http://127.0.0.1:54321", "数据库").hostname, "127.0.0.1");
  assert.equal(assertLoopbackHttpUrl("http://127.0.0.1:43210/v1", "上游", true).pathname, "/v1");
  for (const address of [
    "http://localhost:54321",
    "http://192.168.1.10:54321",
    "http://example.com:54321",
    "http://2130706433:54321",
    "http://[::1]:54321",
    "https://127.0.0.1:54321",
  ]) {
    assert.throws(() => assertLoopbackHttpUrl(address, "测试"), address);
  }
});

test("进程内假上游按假 token 返回真实 HTTP 成功和失败", async () => {
  const upstream = await startFakeUpstream();
  try {
    const models = await fetch(`${upstream.baseUrl}/models`);
    assert.equal(models.status, 200);
    const modelList = await models.json() as { data: Array<{ id: string }> };
    assert.ok(modelList.data.some((model) => model.id === "claude-haiku-5-5"));
    assert.ok(modelList.data.some((model) => model.id === "claude-haiku-5.5"));

    const endpoint = `${upstream.baseUrl}/chat/completions`;
    const body = JSON.stringify({ model: "demo-find-model" });
    const success = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer codex-local-demo-not-a-real-secret", "content-type": "application/json" }, body });
    const failure = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer codex-local-demo-invalid-test-key", "content-type": "application/json" }, body });
    assert.equal(success.status, 200);
    assert.equal(failure.status, 404);
    assert.deepEqual(upstream.requests.slice(-2).map((request) => request.status), [200, 404]);
  } finally {
    await closeServer(upstream.server);
  }
});
