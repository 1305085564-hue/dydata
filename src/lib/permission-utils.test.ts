import assert from "node:assert/strict";
import test from "node:test";

import { fixedPermissions, hasAnyPermission, hasPermission } from "./permission-utils";
import type { Permissions } from "@/types";

test("旧 owner 名称不能绕过固定权限", () => {
  const none = {} as Permissions;
  const companyOwnerPermissions = fixedPermissions("company_owner", none);

  assert.equal(hasPermission("owner", none, "manage_system"), false);
  assert.equal(hasPermission("owner", companyOwnerPermissions, "manage_members"), true);
  assert.equal(hasPermission("owner", companyOwnerPermissions, "manage_system"), true);
  assert.equal(hasPermission("member", none, "use_ai_copy"), false);
  assert.equal(hasAnyPermission("member", { use_ai_copy: true } as Permissions), true);
});
