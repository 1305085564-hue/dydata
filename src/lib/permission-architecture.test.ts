import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("公司角色权限只从 permission-contract 读取", () => {
  const companyPermissions = source("src/lib/company-permissions.ts");

  assert.match(companyPermissions, /from ["']@\/lib\/permission-contract["']/);
  assert.match(companyPermissions, /PERMISSION_CONTRACT\.roles/);
  assert.doesNotMatch(companyPermissions, /company_owner:\s*\[/);
});

test("页面权限与 API 管理鉴权共用同一个身份核心", () => {
  const context = source("src/lib/current-permission-context.ts");
  const permissions = source("src/lib/permissions.ts");
  const authHelper = source("src/app/api/admin/auth-helper.ts");

  assert.match(context, /export async function resolvePermissionCore/);
  assert.match(permissions, /resolvePermissionCore\(/);
  assert.doesNotMatch(permissions, /\.from\(["']profiles["']\)/);
  assert.match(authHelper, /resolvePermissionCore\(/);
  assert.doesNotMatch(authHelper, /\.from\(["']profiles["']\)/);
});

test("旧 hasPermission 入口从生产代码中完全删除", () => {
  const paths = [
    "src/lib/permission-utils.ts",
    "src/lib/permissions.ts",
    "src/lib/analytics-access.ts",
    "src/components/nav-bar.tsx",
    "src/lib/exemption-permissions.ts",
    "src/lib/conversion-hub/service.ts",
    "src/app/(app)/admin/actions.ts",
    "src/app/(app)/admin/join-request-actions.ts",
    "src/app/api/export/route.ts",
    "src/app/api/production/_shared.ts",
    "src/app/api/rewrite/skills/[id]/route.ts",
    "src/app/api/rewrite/skills/route.ts",
  ];

  for (const path of paths) {
    assert.doesNotMatch(source(path), /\bhasPermission\b/, path);
  }
});
