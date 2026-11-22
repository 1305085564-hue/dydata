import assert from "node:assert/strict";
import test from "node:test";

import { resolveMemberPermissionEditorRole } from "./member-permission-editor";

test("成员权限编辑器使用双字段解析 legacy owner", () => {
  assert.equal(
    resolveMemberPermissionEditorRole({ role: "owner", company_role: null }),
    "company_owner",
  );
});

test("成员权限编辑器遇到双字段冲突时拒绝推导角色", () => {
  assert.equal(
    resolveMemberPermissionEditorRole({ role: "admin", company_role: "member" }),
    null,
  );
});
