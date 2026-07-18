import test from "node:test";
import assert from "node:assert/strict";

import { getUserPermissions, hasPermission, isAdminLevel } from "./permissions";

test("权限模块继续导出统一权限判断", () => {
  assert.equal(hasPermission("owner", {} as never, "manage_members"), true);
  assert.equal(isAdminLevel("member"), false);
});

test("请求上下文外读取当前用户权限明确失败", async () => {
  await assert.rejects(() => getUserPermissions(), /outside a request scope|request scope|cookies/i);
});
