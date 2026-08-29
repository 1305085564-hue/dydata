import assert from "node:assert/strict";
import test from "node:test";

import { getRoleLabel } from "./role-label";

test("角色文案使用已确认的业务术语", () => {
  assert.equal(getRoleLabel("member"), "组员");
  assert.equal(getRoleLabel("admin"), "组长 · 管理");
  assert.equal(getRoleLabel("company_owner"), "公司所有者");
});

test("兼容旧 owner，并让归档状态覆盖原角色", () => {
  assert.equal(getRoleLabel("owner"), "公司所有者");
  assert.equal(getRoleLabel("admin", { membershipStatus: "archived" }), "已归档");
  assert.equal(getRoleLabel("archived"), "已归档");
});

test("优先使用稳定 company_role 识别公司所有者", () => {
  assert.equal(getRoleLabel("admin", { companyRole: "company_owner" }), "公司所有者");
  assert.equal(getRoleLabel("member", { companyRole: "admin" }), "组长 · 管理");
});

test("未知或缺失角色按最低权限文案回退为组员", () => {
  assert.equal(getRoleLabel("unknown"), "组员");
  assert.equal(getRoleLabel(null), "组员");
});
