import test from "node:test";
import assert from "node:assert/strict";

import {
  ARCHIVE_ROLLBACK_GUIDANCE,
  changeUserRole,
  kickUser,
} from "./user-management";

const context = { actorId: "u1", actorRole: "owner", actorPermissions: {} } as const;

test("用户管理在参数错误时不连接数据库", async () => {
  assert.deepEqual(await kickUser({}, false, context as never), { success: false, error: "缺少 userId" });
  assert.deepEqual(await changeUserRole({ userId: "u2", newRole: "owner" }, false, context as never), { success: false, error: "newRole 仅支持 member/admin" });
});

test("AI 归档回滚说明不会伪装成只恢复 profile 状态的 SQL", () => {
  assert.doesNotMatch(ARCHIVE_ROLLBACK_GUIDANCE, /update\s+profiles/i);
  assert.match(ARCHIVE_ROLLBACK_GUIDANCE, /Auth/);
  assert.match(ARCHIVE_ROLLBACK_GUIDANCE, /restoreMember/);
});

test("归档和改角色在查询数据库前拒绝跨团队或归档目标", async () => {
  const scoped = { actorId: "owner", actorRole: "admin" as const, actorCompanyRole: "company_owner" as const, actorPermissions: { manage_members: true }, activeVisibleUserIds: ["own"] };
  assert.deepEqual(await kickUser({ userId: "other", reason: "测试" }, false, scoped), { success: false, error: "不能归档当前管理范围外的成员" });
  assert.deepEqual(await changeUserRole({ userId: "other", newRole: "admin" }, false, scoped), { success: false, error: "不能修改当前管理范围外的成员" });
});
