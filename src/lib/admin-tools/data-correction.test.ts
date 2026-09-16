import test from "node:test";
import assert from "node:assert/strict";

import { deleteMetrics, fillMissingData, grantExemption } from "./data-correction";

test("数据修正缺参数时返回明确错误且不连接数据库", async () => {
  assert.deepEqual(await deleteMetrics({}, false), { success: false, error: "缺少 metricsId" });
  assert.deepEqual(await fillMissingData({ userId: "u1", date: null }), { success: false, error: "缺少 userId 或 date" });
  assert.deepEqual(await grantExemption({ userIds: [], userId: null }, true), { success: false, error: "缺少 userId/userIds" });
});

test("跨团队补填和豁免在创建 service-role 连接前被拒绝", async () => {
  const context = { actorId: "owner", actorRole: "admin" as const, actorCompanyRole: "company_owner" as const, actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["own"] };
  assert.deepEqual(await fillMissingData({ userId: "other", date: "2026-09-16" }, context), { success: false, error: "不能操作当前管理范围外的成员数据" });
  assert.deepEqual(await grantExemption({ userIds: ["own", "other"] }, true, context), { success: false, error: "不能操作当前管理范围外的成员" });
});
