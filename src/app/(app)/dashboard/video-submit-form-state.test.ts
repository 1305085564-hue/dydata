import assert from "node:assert/strict";
import test from "node:test";

import {
  addRoleOverride,
  getActiveNonSelfRoles,
  removeRoleOverride,
  resolveDraftManualTopicState,
  resolveDraftTopicId,
  resolveOperatorUserIdForTopic,
  resolveScriptAuthorUserIdForTopic,
  sanitizeTopicSearchKeyword,
  setOperatorToSelf,
  setOperatorUser,
  shouldAutoBindNewTopic,
  shouldAutoRedirectToGrowthAfterSubmit,
  shouldAutoSelectSuggestedTopic,
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

test("选题认领只自动填入文案岗位，并且不覆盖人工选择", () => {
  assert.equal(
    resolveScriptAuthorUserIdForTopic({
      currentScriptAuthorUserId: "user-self",
      claimantUserId: "user-claimant",
      currentUserId: "user-self",
      hasManualScriptAuthorSelection: false,
    }),
    "user-claimant",
  );
  assert.equal(
    resolveScriptAuthorUserIdForTopic({
      currentScriptAuthorUserId: "user-self",
      claimantUserId: "user-claimant",
      currentUserId: "user-self",
      hasManualScriptAuthorSelection: true,
    }),
    "user-self",
  );
  assert.equal(
    resolveScriptAuthorUserIdForTopic({
      currentScriptAuthorUserId: "user-self",
      claimantUserId: "user-self",
      currentUserId: "user-self",
      hasManualScriptAuthorSelection: false,
    }),
    "user-self",
  );
});

test("子题认领人只在责任人未被手动修改时自动接管", () => {
  assert.equal(
    resolveOperatorUserIdForTopic({
      currentOperatorUserId: "123e4567-e89b-12d3-a456-426614174010",
      claimantUserId: "123e4567-e89b-12d3-a456-426614174011",
      hasManualOperatorSelection: false,
    }),
    "123e4567-e89b-12d3-a456-426614174011",
  );
  assert.equal(
    resolveOperatorUserIdForTopic({
      currentOperatorUserId: "123e4567-e89b-12d3-a456-426614174010",
      claimantUserId: "123e4567-e89b-12d3-a456-426614174011",
      hasManualOperatorSelection: true,
    }),
    "123e4567-e89b-12d3-a456-426614174010",
  );
  assert.equal(
    resolveOperatorUserIdForTopic({
      currentOperatorUserId: "123e4567-e89b-12d3-a456-426614174010",
      claimantUserId: null,
      hasManualOperatorSelection: false,
    }),
    "123e4567-e89b-12d3-a456-426614174010",
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

test("认领锁定和手动选题会阻止新建选题自动覆盖", () => {
  assert.equal(
    shouldAutoBindNewTopic({
      urlLocked: true,
      isManuallySet: false,
      topicId: null,
    }),
    false,
  );
  assert.equal(
    shouldAutoBindNewTopic({
      urlLocked: false,
      isManuallySet: true,
      topicId: "topic-a",
    }),
    false,
  );
  assert.equal(
    shouldAutoBindNewTopic({
      urlLocked: false,
      isManuallySet: true,
      topicId: null,
    }),
    true,
  );
});

test("恢复草稿时锁定选题不被草稿覆盖", () => {
  assert.equal(
    resolveDraftTopicId({
      urlLocked: true,
      currentTopicId: "locked-topic",
      draftTopicId: "draft-topic",
    }),
    "locked-topic",
  );
  assert.equal(
    resolveDraftTopicId({
      urlLocked: false,
      currentTopicId: "current-topic",
      draftTopicId: "draft-topic",
    }),
    "draft-topic",
  );
});

test("恢复草稿时保留或还原手动选题状态", () => {
  assert.equal(
    resolveDraftManualTopicState({
      urlLocked: true,
      currentIsManuallySet: true,
      draftIsManuallySet: false,
      draftTopicId: null,
    }),
    true,
  );
  assert.equal(
    resolveDraftManualTopicState({
      urlLocked: false,
      currentIsManuallySet: false,
      draftTopicId: "legacy-topic",
    }),
    true,
  );
  assert.equal(
    resolveDraftManualTopicState({
      urlLocked: false,
      currentIsManuallySet: true,
      draftIsManuallySet: false,
      draftTopicId: "topic-a",
    }),
    false,
  );
});

test("自动推荐只在未锁定、未手动、未选中时填入", () => {
  assert.equal(
    shouldAutoSelectSuggestedTopic({
      urlLocked: false,
      isManuallySet: false,
      currentTopicId: null,
    }),
    true,
  );
  assert.equal(
    shouldAutoSelectSuggestedTopic({
      urlLocked: false,
      isManuallySet: false,
      currentTopicId: "topic-a",
    }),
    false,
  );
  assert.equal(
    shouldAutoSelectSuggestedTopic({
      urlLocked: false,
      isManuallySet: true,
      currentTopicId: null,
    }),
    false,
  );
});

test("搜索关键词会清理会破坏 PostgREST or 语法的字符", () => {
  assert.equal(sanitizeTopicSearchKeyword('  爆款%,()"  选题  '), "爆款 选题");
});
