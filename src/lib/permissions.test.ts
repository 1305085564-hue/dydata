import test from "node:test";
import assert from "node:assert/strict";

import { getUserPermissions } from "./permissions";

test("请求上下文外读取当前用户权限明确失败", async () => {
  await assert.rejects(() => getUserPermissions(), /outside a request scope|request scope|cookies/i);
});
