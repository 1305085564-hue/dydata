import assert from "node:assert/strict";
import test from "node:test";

import { fixedPermissions, hasAnyPermission } from "./permission-utils";
import type { Permissions } from "@/types";

test("固定权限按公司角色生成，不读取旧 JSON", () => {
  const none = {} as Permissions;
  const companyOwnerPermissions = fixedPermissions("company_owner", none);

  assert.equal(none.manage_system, undefined);
  assert.equal(companyOwnerPermissions.manage_members, true);
  assert.equal(companyOwnerPermissions.manage_system, true);
  assert.equal(fixedPermissions("member", { use_ai_copy: true }).use_ai_copy, undefined);
  assert.equal(hasAnyPermission("member", { use_ai_copy: true } as Permissions), true);
});
