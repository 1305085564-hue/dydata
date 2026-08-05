import assert from "node:assert/strict";
import test from "node:test";

import { hasAnyPermission, hasPermission } from "./permission-utils";
import type { Permissions } from "@/types";

test("owner 永远有权限，成员只使用显式授权", () => {
  const none = {} as Permissions;
  assert.equal(hasPermission("owner", none, "use_ai_copy"), true);
  assert.equal(hasPermission("member", none, "use_ai_copy"), false);
  assert.equal(hasAnyPermission("member", { use_ai_copy: true } as Permissions), true);
});
