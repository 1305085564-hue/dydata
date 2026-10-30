import assert from "node:assert/strict";
import test from "node:test";
import { precheckReturnVideo } from "./video-return";

test("卡片关闭时 from=video 也不能发预检请求", () => {
  let calls = 0;
  const request = (() => { calls++; return Promise.resolve(new Response()); }) as typeof fetch;
  precheckReturnVideo(false, "video", "v", () => {}, request)();
  assert.equal(calls, 0);
});
test("打开卡片才预检；不存在/无权限/失败静默隐藏，关闭后忽略旧响应", async () => {
  for (const status of [200, 403, 404, 500]) {
    const values: boolean[] = [];
    let calls = 0;
    const request = (async () => { calls++; return new Response(null, { status }); }) as typeof fetch;
    precheckReturnVideo(true, "video", "v", value => values.push(value), request);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(values.at(-1), status === 200);
  }
  const values: boolean[] = [];
  const cancel = precheckReturnVideo(true, "video", "v", value => values.push(value), (async () => new Response()) as typeof fetch);
  cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(values, [false]);
});
