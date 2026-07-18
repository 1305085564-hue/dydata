import assert from "node:assert/strict";
import test from "node:test";

import { canUseAiCopywriting, hasPermission, isAdminLevel } from "./permission-utils";
import type { Permissions } from "@/types";

test("owner 永远有权限，成员只使用显式授权", () => {
  const none = {} as Permissions;
  assert.equal(hasPermission("owner", none, "use_ai_copywriting"), true);
  assert.equal(hasPermission("member", none, "use_ai_copywriting"), false);
  assert.equal(canUseAiCopywriting("member", { use_ai_copywriting: true } as Permissions), true);
});

test("管理员级身份按业务角色收口", () => {
  assert.equal(isAdminLevel("team_admin"), true);
  assert.equal(isAdminLevel("member"), false);
});
