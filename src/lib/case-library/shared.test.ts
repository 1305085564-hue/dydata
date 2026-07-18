import test from "node:test";
import assert from "node:assert/strict";

import {
  CASE_LIBRARY_PROMOTION_LEVELS,
  CASE_LIBRARY_USAGE_STATES,
  isCaseLibraryPromotionLevel,
  isCaseLibraryUsageState,
  isCaseLibraryView,
  isScriptResultFlag,
} from "./shared";

test("案例库枚举接受全部合法状态", () => {
  assert.ok(CASE_LIBRARY_USAGE_STATES.every(isCaseLibraryUsageState));
  assert.ok(CASE_LIBRARY_PROMOTION_LEVELS.every(isCaseLibraryPromotionLevel));
  assert.equal(isCaseLibraryView("admin"), true);
  assert.equal(isScriptResultFlag("pass"), true);
});

test("null、空字符串和未知状态被拒绝", () => {
  assert.equal(isCaseLibraryUsageState(null), false);
  assert.equal(isCaseLibraryPromotionLevel(""), false);
  assert.equal(isCaseLibraryView("owner"), false);
  assert.equal(isScriptResultFlag(0), false);
});
