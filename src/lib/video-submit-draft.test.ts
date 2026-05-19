import test from "node:test";
import assert from "node:assert/strict";

import { isVideoSubmitDraftEmpty } from "./video-submit-draft";

function createDefaultDraft() {
  return {
    meta: {
      videoUrl: "",
      videoTitle: "",
      content: "",
      bizDate: "2026-05-19",
      publishedAt: "2026-05-18T10:30",
      publishedAtText: "",
      anomalyStatus: "正常",
      uploadedAt: "2026/5/19 10:30:00",
      topicTag: "复盘",
      contentKeywords: [],
    },
    fields: {
      play_count: { value: "", source: "manual", requiresManualConfirmation: false, confirmed: true },
      follower_convert: { value: "0", source: "manual", requiresManualConfirmation: false, confirmed: true },
    },
    slots: {
      screenshot_1: { status: "empty", required: true, confirmed: false },
      screenshot_2: { status: "empty", required: true, confirmed: false },
      screenshot_3: { status: "empty", required: false, confirmed: false },
    },
    scriptText: "",
    keywordInput: "",
  };
}

test("默认填报表单不算可恢复草稿", () => {
  assert.equal(isVideoSubmitDraftEmpty(createDefaultDraft()), true);
});

test("用户填写标题后算可恢复草稿", () => {
  const draft = createDefaultDraft();
  draft.meta.videoTitle = "一条测试视频";

  assert.equal(isVideoSubmitDraftEmpty(draft), false);
});

test("上传或识别过截图后算可恢复草稿", () => {
  const draft = createDefaultDraft();
  draft.slots.screenshot_1.status = "confirmed";

  assert.equal(isVideoSubmitDraftEmpty(draft), false);
});

test("默认 0 指标不算草稿，非零指标算草稿", () => {
  const draft = createDefaultDraft();
  draft.fields.follower_convert.value = "0";

  assert.equal(isVideoSubmitDraftEmpty(draft), true);

  draft.fields.follower_convert.value = "3";
  assert.equal(isVideoSubmitDraftEmpty(draft), false);
});
