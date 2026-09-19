import test from "node:test";
import assert from "node:assert/strict";

import { executeAdminTool } from "./index";

const ownerContext = { actorId: "o1", actorRole: "owner", actorPermissions: {} } as const;

test("未注册工具即使 owner 也不能执行", async () => {
  assert.deepEqual(await executeAdminTool({ toolName: "unknown", params: {}, context: { ...ownerContext, actorPermissions: { manage_system: true }, actorRole: "admin" } as never }), { success: false, error: "未注册工具，禁止执行" });
});

test("普通成员无权限时在调用工具前返回错误", async () => {
  const context = { actorId: "u1", actorRole: "member", actorPermissions: {} };
  assert.deepEqual(await executeAdminTool({ toolName: "getUserInfo", params: {}, context: context as never }), { success: false, error: "无权限执行该工具" });
});

test("组员即使有个人分析权限，也不能调用 AI 管理工具", async () => {
  const context = { actorId: "u1", actorRole: "member", actorPermissions: { view_analytics: true } };
  assert.deepEqual(await executeAdminTool({ toolName: "getTaskStatus", params: { taskType: "daily_review" }, context: context as never }), { success: false, error: "无权限执行该工具" });
});

test("组长即使有成员管理权限，也不能调用豁免工具", async () => {
  const context = { actorId: "a1", actorRole: "admin", actorPermissions: { manage_members: true, manage_fulfillment: true } };
  assert.deepEqual(await executeAdminTool({ toolName: "grantExemption", params: { userId: "u2" }, context: context as never }), { success: false, error: "无权限执行该工具" });
});

test("公司所有者持 AI 管理权限时可执行无数据读取的诊断工具", async () => {
  const context = { actorId: "o1", actorRole: "admin" as const, actorCompanyRole: "company_owner" as const, actorPermissions: { use_ai_assist: true, manage_system: true }, activeVisibleUserIds: ["o1"] };
  const result = await executeAdminTool({ toolName: "diagnoseIssue", params: { symptom: "任务卡住" }, context });
  assert.equal(result.success, true);
});

test("兼容窗口中的 legacy owner 通过统一角色解析执行 AI 工具", async () => {
  const context = {
    actorId: "o1",
    actorRole: "owner" as const,
    actorPermissions: { use_ai_assist: true, manage_system: true },
  };
  const result = await executeAdminTool({ toolName: "diagnoseIssue", params: { symptom: "任务卡住" }, context });
  assert.equal(result.success, true);
});
