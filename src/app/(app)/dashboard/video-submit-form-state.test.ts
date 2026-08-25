import assert from "node:assert/strict";
import test from "node:test";

import {
  addRoleOverride,
  findNextScreenshotUploadRole,
  removeRoleOverride,
  setOperatorToSelf,
  setOperatorUser,
  preserveBizDateWhenPublishedAtChanges,
  resolveVideoSubmitMetaFields,
  resolveVideoSubmitMode,
  getMissingEditPayloadFields,
  buildVideoSubmissionEditRefill,
  getVideoSubmissionEditDetailError,
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
    }),
    "screenshot_1",
  );

  assert.equal(
    findNextScreenshotUploadRole({
      screenshot_1: { status: "empty" },
      screenshot_2: { status: "confirmed" },
    }),
    "screenshot_1",
  );

  assert.equal(
    findNextScreenshotUploadRole({
      screenshot_1: { status: "recognizing" },
      screenshot_2: { status: "confirmed" },
    }),
    null,
  );
});


test("可限制多图上传只使用界面可见的两个截图槽", () => {
  assert.equal(
    findNextScreenshotUploadRole(
      {
        screenshot_1: { status: "confirmed" },
        screenshot_2: { status: "confirmed" },
      },
      ["screenshot_1", "screenshot_2"],
    ),
    null,
  );
});

test("V2 提交 mode 会区分新建、异常和带原视频 id 的完整编辑", () => {
  assert.equal(resolveVideoSubmitMode({ panelMode: "create", anomalyStatus: "normal" }), "create");
  assert.equal(resolveVideoSubmitMode({ panelMode: "backfill", anomalyStatus: "abnormal" }), "abnormal");
  assert.equal(
    resolveVideoSubmitMode({
      panelMode: "editToday",
      anomalyStatus: "normal",
      videoId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    "edit",
  );
});

test("完整编辑保留空发布时间和异常补充字段，并将正常状态字段显式发送为 null", () => {
  assert.deepEqual(
    resolveVideoSubmitMetaFields({
      mode: "editToday",
      anomalyStatus: "normal",
      publishedAt: "",
      punishType: "",
      platformNotice: "",
      appeal: "",
      defaultPublishedAt: "2026-08-25T19:00",
    }),
    {
      publishedAt: null,
      punishType: null,
      platformNotice: null,
      appeal: null,
    },
  );

  assert.deepEqual(
    resolveVideoSubmitMetaFields({
      mode: "create",
      anomalyStatus: "abnormal",
      publishedAt: "",
      punishType: "",
      platformNotice: "平台提示",
      appeal: "已申诉",
      defaultPublishedAt: "2026-08-25T19:00",
    }),
    {
      publishedAt: "2026-08-25T19:00",
      punishType: "限流",
      platformNotice: "平台提示",
      appeal: "已申诉",
    },
  );
});

test("今日编辑缺少完整 DTO 时返回缺失字段，不能用空值覆盖原记录", () => {
  assert.deepEqual(
    getMissingEditPayloadFields(null),
    ["video_id", "account_id", "biz_date", "metrics", "assignees"],
  );
  assert.deepEqual(
    getMissingEditPayloadFields({
      video_id: "123e4567-e89b-12d3-a456-426614174000",
      account_id: "account-1",
      biz_date: "2026-08-25",
      metrics: {},
      assignees: {
        script_author_user_id: "user-1",
        video_editor_user_id: "user-1",
        operator_user_id: "user-1",
      },
    }),
    [],
  );
});

test("完整编辑详情必须逐项回填旧视频、指标、截图、标签、责任人和导粉话术", () => {
  const detail = {
    videoId: "123e4567-e89b-12d3-a456-426614174000",
    accountId: "account-1",
    bizDate: "2026-08-25",
    meta: {
      videoUrl: "https://www.douyin.com/video/1",
      videoTitle: "原视频标题",
      content: "原视频文案",
      publishedAt: "2026-08-24T12:30:00+08:00",
      publishedAtText: "昨天中午发布",
      anomalyStatus: "abnormal" as const,
      punishType: "限流",
      platformNotice: "平台提示",
      appeal: "已申诉",
      topicTag: "干货",
      videoForm: "口播",
      contentKeywords: ["效率", "工具"],
      scriptAuthorUserId: "123e4567-e89b-12d3-a456-426614174001",
      videoEditorUserId: "123e4567-e89b-12d3-a456-426614174002",
      operatorUserId: "123e4567-e89b-12d3-a456-426614174003",
    },
    metrics: {
      playCount: 0,
      likes: 12,
      comments: 3,
      shares: 4,
      favorites: 5,
      followerGain: 6,
      followerLoss: 7,
      followerConvert: 8,
      avgPlayDuration: 9.5,
      bounceRate2s: 10.25,
      completionRate5s: 11.75,
      completionRate: 12.5,
    },
    assets: [
      {
        role: "screenshot_1" as const,
        url: "https://app.example.com/api/submission-screenshots/file?path=one",
        confirmed: true,
        confidenceScore: 0.96,
        recognizedFields: { play_count: 0, likes: 12 },
        screenshotType: "data" as const,
      },
      {
        role: "screenshot_2" as const,
        url: "https://app.example.com/api/submission-screenshots/file?path=two",
        confirmed: true,
        confidenceScore: 0.88,
        recognizedFields: { retention_metrics: { completion_rate: 12.5 } },
        screenshotType: "retention" as const,
      },
    ],
    conversionScript: { text: "点击主页领取", format: "oral" },
    uploadedAt: "2026-08-25T10:00:00+08:00",
  };

  assert.equal(
    getVideoSubmissionEditDetailError(detail, { accountId: "account-1", bizDate: "2026-08-25" }),
    null,
  );

  const refill = buildVideoSubmissionEditRefill(detail);
  assert.deepEqual(refill.meta, detail.meta);
  assert.deepEqual(refill.metrics, {
    play_count: "0",
    likes: "12",
    comments: "3",
    shares: "4",
    favorites: "5",
    follower_gain: "6",
    follower_loss: "7",
    follower_convert: "8",
    avg_play_duration: "9.5",
    bounce_rate_2s: "10.25",
    completion_rate_5s: "11.75",
    completion_rate: "12.5",
  });
  assert.equal(refill.assets.screenshot_1?.url, detail.assets[0]?.url);
  assert.equal(
    (refill.assets.screenshot_2?.recognizedFields?.retention_metrics as { completion_rate?: number } | undefined)
      ?.completion_rate,
    12.5,
  );
  assert.deepEqual(refill.conversionScript, detail.conversionScript);
  assert.equal(refill.uploadedAt, detail.uploadedAt);
});

test("编辑详情缺字段、与当前账号日期不一致或正常视频少截图时必须阻断保存", () => {
  const completeDetail = {
    videoId: "123e4567-e89b-12d3-a456-426614174000",
    accountId: "account-1",
    bizDate: "2026-08-25",
    meta: {
      videoUrl: null,
      videoTitle: "标题",
      content: "文案",
      publishedAt: null,
      publishedAtText: null,
      anomalyStatus: "normal" as const,
      punishType: null,
      platformNotice: null,
      appeal: null,
      topicTag: "复盘",
      videoForm: null,
      contentKeywords: [],
      scriptAuthorUserId: "123e4567-e89b-12d3-a456-426614174001",
      videoEditorUserId: "123e4567-e89b-12d3-a456-426614174002",
      operatorUserId: "123e4567-e89b-12d3-a456-426614174003",
    },
    metrics: {
      playCount: 1,
      likes: 1,
      comments: 1,
      shares: 1,
      favorites: 1,
      followerGain: 1,
      followerLoss: 0,
      followerConvert: 0,
      avgPlayDuration: 1,
      bounceRate2s: 1,
      completionRate5s: 1,
      completionRate: 1,
    },
    assets: [],
    conversionScript: null,
    uploadedAt: null,
  };

  assert.match(
    getVideoSubmissionEditDetailError(completeDetail, { accountId: "account-1", bizDate: "2026-08-25" }) ?? "",
    /截图/,
  );
  assert.match(
    getVideoSubmissionEditDetailError({ ...completeDetail, accountId: "account-2" }, { accountId: "account-1", bizDate: "2026-08-25" }) ?? "",
    /账号/,
  );
  assert.match(
    getVideoSubmissionEditDetailError({ ...completeDetail, metrics: { ...completeDetail.metrics, playCount: Number.NaN } }, { accountId: "account-1", bizDate: "2026-08-25" }) ?? "",
    /播放量/,
  );
});
