import assert from "node:assert/strict";
import test from "node:test";

import {
  addRoleOverride,
  getActiveNonSelfRoles,
  removeRoleOverride,
  setOperatorToSelf,
  setOperatorUser,
  preserveBizDateWhenPublishedAtChanges,
  shouldAutoRedirectToGrowthAfterSubmit,
} from "./video-submit-form-state";

test("只有实际指派给他人的岗位进入外协暴露集合", () => {
  const userId = "user-self";
  assert.deepEqual(
    getActiveNonSelfRoles({
      userId,
      scriptAuthorUserId: userId,
      videoEditorUserId: null,
      operatorUserId: "user-operator",
    }),
    ["operator"],
  );
});

test("添加外协只打开待选状态，取消外协会恢复为本人", () => {
  const userId = "user-self";
  const added = addRoleOverride({
    userId,
    role: "video_editor",
    assignments: {
      scriptAuthorUserId: userId,
      videoEditorUserId: userId,
      operatorUserId: userId,
    },
    overrides: [],
  });

  assert.deepEqual(added, {
    assignments: {
      scriptAuthorUserId: userId,
      videoEditorUserId: userId,
      operatorUserId: userId,
    },
    overrides: ["video_editor"],
  });
  assert.deepEqual(
    removeRoleOverride({
      userId,
      role: "video_editor",
      assignments: { ...added.assignments, videoEditorUserId: "user-editor" },
      overrides: added.overrides,
    }),
    {
      assignments: {
        scriptAuthorUserId: userId,
        videoEditorUserId: userId,
        operatorUserId: userId,
      },
      overrides: [],
    },
  );
});

test("责任人快捷操作返回当前人或明确指定的人", () => {
  assert.equal(setOperatorToSelf("user-self"), "user-self");
  assert.equal(setOperatorUser("user-operator"), "user-operator");
});

test("今天首次创建提交成功后自动跳转 growth", () => {
  assert.equal(
    shouldAutoRedirectToGrowthAfterSubmit({
      mode: "create",
      bizDate: "2026-07-15",
      today: "2026-07-15",
      submittedViewActive: false,
      hasInitialSummary: false,
    }),
    true,
  );
});

test("补交、编辑和已提交后的继续填写不自动跳转 growth", () => {
  const base = {
    bizDate: "2026-07-15",
    today: "2026-07-15",
    submittedViewActive: false,
    hasInitialSummary: false,
  };

  assert.equal(shouldAutoRedirectToGrowthAfterSubmit({ ...base, mode: "backfill" }), false);
  assert.equal(shouldAutoRedirectToGrowthAfterSubmit({ ...base, mode: "editToday" }), false);
  assert.equal(shouldAutoRedirectToGrowthAfterSubmit({ ...base, mode: "summary" }), false);
  assert.equal(
    shouldAutoRedirectToGrowthAfterSubmit({
      ...base,
      mode: "create",
      submittedViewActive: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoRedirectToGrowthAfterSubmit({
      ...base,
      mode: "create",
      hasInitialSummary: true,
    }),
    false,
  );
});

test("非今日提交不自动跳转 growth", () => {
  assert.equal(
    shouldAutoRedirectToGrowthAfterSubmit({
      mode: "create",
      bizDate: "2026-07-14",
      today: "2026-07-15",
      submittedViewActive: false,
      hasInitialSummary: false,
    }),
    false,
  );
});

test("选择发布时间不应改动归属日期", () => {
  assert.equal(
    preserveBizDateWhenPublishedAtChanges("2026-07-29", "2026-07-28T19:00"),
    "2026-07-29",
  );
  assert.equal(
    preserveBizDateWhenPublishedAtChanges("2026-07-15", "2026-07-15T08:30"),
    "2026-07-15",
  );
});
