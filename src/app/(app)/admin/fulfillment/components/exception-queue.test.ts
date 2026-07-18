import assert from "node:assert/strict";
import test from "node:test";

import { requiresQuickMarkConfirmation } from "./exception-queue";

test("单人确认缺勤必须二次确认，普通状态不额外阻断", () => {
  assert.equal(requiresQuickMarkConfirmation("absent"), true);
  assert.equal(requiresQuickMarkConfirmation("leave"), false);
  assert.equal(requiresQuickMarkConfirmation("waived"), false);
  assert.equal(requiresQuickMarkConfirmation("confirmed_published"), false);
});
