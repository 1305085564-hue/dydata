import test from "node:test";
import assert from "node:assert/strict";

import { executeAdminTool } from "./index";

const ownerContext = { actorId: "o1", actorRole: "owner", actorBusinessRole: "owner", actorPermissions: {} } as const;

test("未注册工具即使 owner 也不能执行", async () => {
  assert.deepEqual(await executeAdminTool({ toolName: "unknown", params: {}, context: ownerContext as never }), { success: false, error: "未注册工具，禁止执行" });
});

test("普通成员无权限时在调用工具前返回错误", async () => {
  const context = { actorId: "u1", actorRole: "member", actorBusinessRole: "member", actorPermissions: {} };
  assert.deepEqual(await executeAdminTool({ toolName: "getUserInfo", params: {}, context: context as never }), { success: false, error: "无权限执行该工具" });
});
