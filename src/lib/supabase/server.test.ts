import test from "node:test";
import assert from "node:assert/strict";

import { createClient } from "./server";

test("请求上下文外调用服务端客户端会明确拒绝", async () => {
  await assert.rejects(() => createClient(), /outside a request scope|request scope|cookies/i);
});

test("keepLoggedIn=false 边界值也不绕过请求上下文", async () => {
  await assert.rejects(() => createClient({ keepLoggedIn: false }), /outside a request scope|request scope|cookies/i);
});
