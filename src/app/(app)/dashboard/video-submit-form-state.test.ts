import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDraftManualTopicState,
  resolveDraftTopicId,
  sanitizeTopicSearchKeyword,
  shouldAutoBindNewTopic,
  shouldAutoRedirectToGrowthAfterSubmit,
  shouldAutoSelectSuggestedTopic,
} from "./video-submit-form-state";

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
