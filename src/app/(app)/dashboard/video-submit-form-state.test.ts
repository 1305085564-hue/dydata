import assert from "node:assert/strict";
import test from "node:test";

import {
  addRoleOverride,
  findNextScreenshotUploadRole,
  removeRoleOverride,
  setOperatorToSelf,
  setOperatorUser,
  preserveBizDateWhenPublishedAtChanges,
  shouldAutoRedirectToGrowthAfterSubmit,
} from "./video-submit-form-state";

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
    preserveBizDateWhenPublishedAtChanges("2026-07-29"),
    "2026-07-29",
  );
  assert.equal(
    preserveBizDateWhenPublishedAtChanges("2026-07-15"),
    "2026-07-15",
  );
});

test("多图上传每张图都按当前最新空槽分配，避免两张截图互相占位", () => {
  assert.equal(
    findNextScreenshotUploadRole({
      screenshot_1: { status: "empty" },
      screenshot_2: { status: "empty" },
      screenshot_3: { status: "empty" },
    }),
    "screenshot_1",
  );

  assert.equal(
    findNextScreenshotUploadRole({
      screenshot_1: { status: "empty" },
      screenshot_2: { status: "confirmed" },
      screenshot_3: { status: "empty" },
    }),
    "screenshot_1",
  );

  assert.equal(
    findNextScreenshotUploadRole({
      screenshot_1: { status: "recognizing" },
      screenshot_2: { status: "confirmed" },
      screenshot_3: { status: "empty" },
    }),
    "screenshot_3",
  );
});


test("可限制多图上传只使用界面可见的两个截图槽", () => {
  assert.equal(
    findNextScreenshotUploadRole(
      {
        screenshot_1: { status: "confirmed" },
        screenshot_2: { status: "confirmed" },
        screenshot_3: { status: "empty" },
      },
      ["screenshot_1", "screenshot_2"],
    ),
    null,
  );
});
