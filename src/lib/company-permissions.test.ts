import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PERMISSIONS_BY_COMPANY_ROLE,
  fixedPermissionsForRole,
  resolveCompanyRole,
} from "@/lib/company-permissions";

test("legacy owner is treated as company_owner, not a group-wide role", () => {
  assert.equal(resolveCompanyRole("owner"), "company_owner");
  assert.equal(resolveCompanyRole("admin"), "admin");
  assert.equal(resolveCompanyRole("member"), "member");
});

test("fixed permissions ignore legacy per-user toggles", () => {
  assert.deepEqual(
    fixedPermissionsForRole("admin", { export_data: true, manage_system: true }),
    Object.fromEntries(DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.admin.map((key) => [key, true])),
  );
  assert.equal(fixedPermissionsForRole("admin", {}).export_data, undefined);
  assert.equal(fixedPermissionsForRole("company_owner", {}).manage_members, true);
  assert.equal(fixedPermissionsForRole("company_owner", {}).manage_system, undefined);
});

test("group mode grants the complete fixed permission set", () => {
  const permissions = fixedPermissionsForRole("admin", {}, true);
  assert.equal(Object.keys(permissions).length, 11);
  assert.equal(permissions.manage_system, true);
});
