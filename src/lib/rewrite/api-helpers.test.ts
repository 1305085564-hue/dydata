import test from "node:test";
import assert from "node:assert/strict";

import { createSSEStream, errorResponse, jsonResponse, parseJsonBody } from "./api-helpers";

test("JSON 成功与错误响应保留状态和稳定文案", async () => {
  const ok = jsonResponse({ count: 0 }, 201);
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { count: 0 });
  const error = errorResponse("invalid input syntax for type uuid", 500);
  assert.equal(error.status, 400);
  assert.deepEqual(await error.json(), { error: "会话 ID 格式不正确" });
});

test("非法请求体返回 400，null JSON 可正常解析", async () => {
  const invalid = await parseJsonBody({ json: async () => { throw new Error("bad"); } } as never);
  assert.ok(invalid instanceof Response);
  assert.equal((invalid as Response).status, 400);
  assert.equal(await parseJsonBody({ json: async () => null } as never), null);
});

test("SSE 流发送事件并可安全关闭", async () => {
  const sse = createSSEStream();
  const reader = sse.stream.getReader();
  sse.send("message", { count: 0 });
  const chunk = await reader.read();
  assert.match(new TextDecoder().decode(chunk.value), /event: message/);
  assert.match(new TextDecoder().decode(chunk.value), /"count":0/);
  sse.close();
  assert.equal((await reader.read()).done, true);
  sse.send("ignored", null);
});
