import test from "node:test";
import assert from "node:assert/strict";

import { areActiveTargetsInScope, isActiveTargetInScope } from "./scope";

const context = {
  actorId: "owner-1",
  actorRole: "owner" as const,
  actorCompanyRole: "company_owner" as const,
  actorPermissions: { use_ai_assist: true },
  activeVisibleUserIds: ["owner-1", "member-1"],
};

test("AI 工具只接受可信范围中的在职目标", () => {
  assert.equal(isActiveTargetInScope(context, "member-1"), true);
  assert.equal(isActiveTargetInScope(context, "other-team"), false);
  assert.equal(isActiveTargetInScope({ ...context, activeVisibleUserIds: undefined }, "member-1"), false);
  assert.equal(areActiveTargetsInScope(context, ["member-1", "other-team"]), false);
});
