import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminModulesFocusMemberId } from "./page";

test("admin modules page accepts profile as a legacy focus parameter", () => {
  assert.equal(resolveAdminModulesFocusMemberId({ profile: "member-1" }), "member-1");
  assert.equal(resolveAdminModulesFocusMemberId({ member: "member-2", profile: "member-1" }), "member-2");
});
