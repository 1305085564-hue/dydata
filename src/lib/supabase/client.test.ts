// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import test from "node:test";
import assert from "node:assert/strict";

import { createClient } from "./client";

test("创建腾讯云 CloudBase 浏览器客户端", () => {
  const client = createClient();
  assert.ok(client.auth);
  assert.equal(typeof client.from, "function");
});
