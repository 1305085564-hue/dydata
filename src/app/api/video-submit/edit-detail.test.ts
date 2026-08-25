import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditSubmissionContract,
  buildVideoSubmissionEditDetail,
  hasReusableConfirmedScreenshots,
  mergeReusableScreenshotFields,
  resolveEditTopicId,
} from "./edit-detail";

const VIDEO_ID = "123e4567-e89b-12d3-a456-426614174000";
const USER_ID = "123e4567-e89b-12d3-a456-426614174001";
const EDIT_DTO = {
  mode: "edit",
  video_id: VIDEO_ID,
  account_id: "123e4567-e89b-12d3-a456-426614174002",
  biz_date: "2026-08-25",
  video_url: "https://example.com/video",
  video_title: "完整编辑标题",
  content: "完整编辑文案",
  published_at: "2026-08-24T10:00:00.000Z",
  published_at_text: "2026-08-24 18:00",
  anomaly_status: "normal",
  punish_type: null,
  platform_notice: null,
  appeal: null,
  topic_tag: "复盘",
  topic_id: null,
  video_form: "出镜",
  content_keywords: ["复盘"],
  script_author_user_id: USER_ID,
  video_editor_user_id: USER_ID,
  operator_user_id: USER_ID,
  assets: [],
  script_text: null,
  script_format: "oral",
  metrics: {
    play_count: 1200,
    likes: 12,
    comments: 3,
    shares: 4,
    favorites: 5,
    follower_gain: 8,
    follower_loss: 0,
    follower_convert: 0,
    avg_play_duration: 12,
    bounce_rate_2s: 20,
    completion_rate_5s: 45,
    completion_rate: 18,
  },
};

test("今日编辑完整 DTO 组装出视频、24h 快照、日报、标签、责任人与 usage 契约", () => {
  const result = buildEditSubmissionContract(EDIT_DTO);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.dto.video_id, VIDEO_ID);
  assert.deepEqual(result.dto.video, {
    account_id: EDIT_DTO.account_id,
    video_url: EDIT_DTO.video_url,
    video_title: EDIT_DTO.video_title,
    content: EDIT_DTO.content,
    published_at: EDIT_DTO.published_at,
    anomaly_status: EDIT_DTO.anomaly_status,
    punish_type: null,
    platform_notice: null,
    appeal: null,
    topic_id: null,
  });
  assert.deepEqual(result.dto.snapshot24h, {
    snapshot_type: "24h",
    metrics: EDIT_DTO.metrics,
    assets: [],
  });
  assert.deepEqual(result.dto.dailyReport, {
    account_id: EDIT_DTO.account_id,
    report_date: EDIT_DTO.biz_date,
    title: EDIT_DTO.video_title,
    content: EDIT_DTO.content,
    published_at: EDIT_DTO.published_at,
    metrics: EDIT_DTO.metrics,
  });
  assert.deepEqual(result.dto.manualTags, {
    topic_tag: "复盘",
    video_form: "出镜",
    content_keywords: ["复盘"],
  });
  assert.deepEqual(result.dto.assignees, {
    script_author_user_id: USER_ID,
    video_editor_user_id: USER_ID,
    operator_user_id: USER_ID,
  });
  assert.deepEqual(result.dto.usageRecord, {
    script_text: null,
    script_format: "oral",
    follower_convert: 0,
  });
});

test("编辑 DTO 缺少责任人或 24h 指标时明确拒绝", () => {
  const withoutAssignee = { ...EDIT_DTO } as Record<string, unknown>;
  delete withoutAssignee.operator_user_id;
  assert.deepEqual(buildEditSubmissionContract(withoutAssignee), {
    ok: false,
    error: "编辑提交缺少完整字段：operator_user_id",
  });

  const withoutMetric = {
    ...EDIT_DTO,
    metrics: { ...EDIT_DTO.metrics },
  } as { metrics: Record<string, unknown> } & Record<string, unknown>;
  delete withoutMetric.metrics.completion_rate;
  assert.deepEqual(buildEditSubmissionContract(withoutMetric), {
    ok: false,
    error: "编辑提交缺少 24h 指标：completion_rate",
  });
});

test("旧编辑调用方缺少 mode 时仍按 video_id 识别编辑", () => {
  const legacyPayload = { ...EDIT_DTO } as Record<string, unknown>;
  delete legacyPayload.mode;

  const result = buildEditSubmissionContract(legacyPayload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.dto.video_id, VIDEO_ID);
});

test("编辑 DTO 不把非法指标或标签元素静默转换掉", () => {
  assert.deepEqual(
    buildEditSubmissionContract({
      ...EDIT_DTO,
      metrics: { ...EDIT_DTO.metrics, follower_convert: "3" },
    }),
    {
      ok: false,
      error: "编辑提交的 24h 指标格式不正确：follower_convert",
    },
  );

  assert.deepEqual(
    buildEditSubmissionContract({
      ...EDIT_DTO,
      content_keywords: ["复盘", 3],
    }),
    { ok: false, error: "编辑提交的手工标签格式不正确" },
  );
});

test("编辑请求没有重新上传截图时保留数据库已有截图资产", () => {
  const existing = {
    screenshot_urls: ["https://dydata.cc/old-interaction.png", "https://dydata.cc/old-retention.png"],
    curve_screenshot_url: "https://dydata.cc/old-curve.png",
    retention_screenshot_url: "https://dydata.cc/old-retention-detail.png",
    vs_previous: { ocr_assets: [{ role: "screenshot_1", confirmed: true }] },
  };

  assert.deepEqual(mergeReusableScreenshotFields("edit", [], existing), existing);
});

test("编辑表单未提供选题关联时保留原 topic_id，避免空值覆盖旧视频", () => {
  assert.equal(
    resolveEditTopicId("edit", null, "123e4567-e89b-12d3-a456-426614174099"),
    "123e4567-e89b-12d3-a456-426614174099",
  );
  assert.equal(resolveEditTopicId("edit", "123e4567-e89b-12d3-a456-426614174100", "old-topic"), "123e4567-e89b-12d3-a456-426614174100");
  assert.equal(resolveEditTopicId("create", null, "old-topic"), null);
});

test("完整编辑详情保留旧视频、指标、OCR 截图、标签、责任人与导粉话术，不填默认值", () => {
  const result = buildVideoSubmissionEditDetail({
    video: {
      id: VIDEO_ID,
      account_id: EDIT_DTO.account_id,
      video_url: EDIT_DTO.video_url,
      video_title: EDIT_DTO.video_title,
      content: EDIT_DTO.content,
      published_at: EDIT_DTO.published_at,
      uploaded_at: "2026-08-25T03:00:00.000Z",
      anomaly_status: "normal",
      punish_type: null,
      platform_notice: null,
      appeal: null,
      script_author_user_id: USER_ID,
      video_editor_user_id: null,
      operator_user_id: "123e4567-e89b-12d3-a456-426614174003",
    },
    snapshot: {
      id: "123e4567-e89b-12d3-a456-426614174004",
      video_id: VIDEO_ID,
      snapshot_type: "24h",
      play_count: 1200,
      likes: 12,
      comments: 3,
      shares: 4,
      favorites: 5,
      follower_gain: 8,
      follower_loss: 1,
      follower_convert: 2,
      avg_play_duration: 12.5,
      bounce_rate_2s: 20,
      completion_rate_5s: 45,
      completion_rate: 18,
      screenshot_urls: ["https://dydata.cc/screenshot-1.png", "https://dydata.cc/screenshot-2.png"],
      curve_screenshot_url: null,
      retention_screenshot_url: null,
      vs_previous: {
        published_at_text: "2026-08-24 18:00",
        ocr_assets: [
          {
            role: "screenshot_1",
            confirmed: true,
            confidence_score: 0.91,
            recognized_fields: { play_count: 1200 },
            screenshot_type: "data",
          },
          {
            role: "screenshot_2",
            confirmed: true,
            confidence_score: 0.88,
            recognized_fields: { completion_rate: 18 },
            screenshot_type: "retention",
          },
        ],
      },
    },
    dailyReport: {
      id: "123e4567-e89b-12d3-a456-426614174005",
      user_id: USER_ID,
      account_id: EDIT_DTO.account_id,
      report_date: EDIT_DTO.biz_date,
    },
    tags: [
      { tag_dimension: "话题", tag_value: "复盘" },
      { tag_dimension: "表达形式", tag_value: "出镜" },
      { tag_dimension: "关键词", tag_value: "复盘" },
      { tag_dimension: "关键词", tag_value: "涨粉" },
    ],
    usageRecord: {
      id: "123e4567-e89b-12d3-a456-426614174006",
      script_text: "关注公众号领取复盘表",
      script_format: "mixed",
    },
    assigneeProfiles: [
      { userId: USER_ID, name: "用户-4001", displayName: "昵称-4001", membershipStatus: "active" },
      { userId: "123e4567-e89b-12d3-a456-426614174003", displayName: "昵称-4003", membershipStatus: "archived" },
      { userId: "123e4567-e89b-12d3-a456-426614174003", name: "重复条目应被去重" },
    ],
    bizDate: EDIT_DTO.biz_date,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.detail, {
    videoId: VIDEO_ID,
    accountId: EDIT_DTO.account_id,
    bizDate: EDIT_DTO.biz_date,
    meta: {
      videoUrl: EDIT_DTO.video_url,
      videoTitle: EDIT_DTO.video_title,
      content: EDIT_DTO.content,
      publishedAt: EDIT_DTO.published_at,
      publishedAtText: "2026-08-24 18:00",
      anomalyStatus: "normal",
      punishType: null,
      platformNotice: null,
      appeal: null,
      topicTag: "复盘",
      videoForm: "出镜",
      contentKeywords: ["复盘", "涨粉"],
      scriptAuthorUserId: USER_ID,
      videoEditorUserId: null,
      operatorUserId: "123e4567-e89b-12d3-a456-426614174003",
    },
    metrics: {
      playCount: 1200,
      likes: 12,
      comments: 3,
      shares: 4,
      favorites: 5,
      followerGain: 8,
      followerLoss: 1,
      followerConvert: 2,
      avgPlayDuration: 12.5,
      bounceRate2s: 20,
      completionRate5s: 45,
      completionRate: 18,
    },
    assets: [
      {
        role: "screenshot_1",
        url: "https://dydata.cc/screenshot-1.png",
        confirmed: true,
        confidenceScore: 0.91,
        recognizedFields: { play_count: 1200 },
        screenshotType: "data",
      },
      {
        role: "screenshot_2",
        url: "https://dydata.cc/screenshot-2.png",
        confirmed: true,
        confidenceScore: 0.88,
        recognizedFields: { completion_rate: 18 },
        screenshotType: "retention",
      },
    ],
    conversionScript: { text: "关注公众号领取复盘表", format: "mixed" },
    uploadedAt: "2026-08-25T03:00:00.000Z",
    assigneeProfiles: [
      { userId: USER_ID, name: "用户-4001", displayName: "昵称-4001", membershipStatus: "active" },
      { userId: "123e4567-e89b-12d3-a456-426614174003", name: null, displayName: "昵称-4003", membershipStatus: "archived" },
    ],
  });
});

test("完整编辑详情缺任一指标或已存截图 OCR 详情时阻止保存，不伪造 0、null 或已确认", () => {
  const source = {
    video: {
      id: VIDEO_ID,
      account_id: EDIT_DTO.account_id,
      video_url: null,
      video_title: "标题",
      content: "文案",
      published_at: null,
      uploaded_at: null,
      anomaly_status: "normal",
      punish_type: null,
      platform_notice: null,
      appeal: null,
      script_author_user_id: null,
      video_editor_user_id: null,
      operator_user_id: null,
    },
    snapshot: {
      id: "snapshot-1",
      video_id: VIDEO_ID,
      snapshot_type: "24h",
      play_count: 10,
      likes: null,
      comments: 0,
      shares: 0,
      favorites: 0,
      follower_gain: 0,
      follower_loss: 0,
      follower_convert: 0,
      avg_play_duration: 0,
      bounce_rate_2s: 0,
      completion_rate_5s: 0,
      completion_rate: 0,
      screenshot_urls: ["https://dydata.cc/screenshot-1.png", "https://dydata.cc/screenshot-2.png"],
      curve_screenshot_url: null,
      retention_screenshot_url: null,
      vs_previous: null,
    },
    dailyReport: { id: "report-1", user_id: USER_ID, account_id: EDIT_DTO.account_id, report_date: EDIT_DTO.biz_date },
    tags: [],
    usageRecord: null,
    bizDate: EDIT_DTO.biz_date,
  };

  assert.deepEqual(buildVideoSubmissionEditDetail(source), {
    ok: false,
    error: "编辑详情不完整：24h 指标 likes 缺失",
  });

  const nullableAssignees = { ...EDIT_DTO } as Record<string, unknown>;
  delete nullableAssignees.topic_id;
  nullableAssignees.script_author_user_id = null;
  nullableAssignees.video_editor_user_id = null;
  nullableAssignees.operator_user_id = null;

  const contract = buildEditSubmissionContract(nullableAssignees);
  assert.equal(contract.ok, true);
  if (!contract.ok) return;
  assert.deepEqual(contract.dto.assignees, {
    script_author_user_id: null,
    video_editor_user_id: null,
    operator_user_id: null,
  });
  assert.equal(contract.dto.video.topic_id, undefined);
});

function buildReusableExisting(overrides: Record<string, unknown> = {}) {
  return {
    screenshot_urls: [
      "https://dydata.cc/api/submission-screenshots/file?path=user/a.png",
      "https://dydata.cc/api/submission-screenshots/file?path=user/b.png",
    ],
    curve_screenshot_url: null,
    retention_screenshot_url: null,
    vs_previous: {
      ocr_assets: [
        { role: "screenshot_1", confirmed: true },
        { role: "screenshot_2", confirmed: true },
      ],
    },
    ...overrides,
  };
}

test("旧截图复用：恰好两个已确认角色且地址合法时才允许复用", () => {
  assert.equal(hasReusableConfirmedScreenshots(buildReusableExisting()), true);
});

test("旧截图复用：ocr_assets 缺失时不再放行", () => {
  const { vs_previous, ...withoutOcr } = buildReusableExisting();
  assert.equal(hasReusableConfirmedScreenshots({ ...withoutOcr, vs_previous: null }), false);
  assert.equal(
    hasReusableConfirmedScreenshots({ ...withoutOcr, vs_previous: {} }),
    false,
  );
});

test("旧截图复用：未确认、损坏、重复、缺角色的条目一律阻断", () => {
  // 未确认
  assert.equal(
    hasReusableConfirmedScreenshots(buildReusableExisting({
      vs_previous: { ocr_assets: [
        { role: "screenshot_1", confirmed: true },
        { role: "screenshot_2", confirmed: false },
      ] },
    })),
    false,
  );
  // 损坏条目
  assert.equal(
    hasReusableConfirmedScreenshots(buildReusableExisting({
      vs_previous: { ocr_assets: ["broken", { role: "screenshot_2", confirmed: true }] },
    })),
    false,
  );
  // 角色重复 + 缺失
  assert.equal(
    hasReusableConfirmedScreenshots(buildReusableExisting({
      vs_previous: { ocr_assets: [
        { role: "screenshot_1", confirmed: true },
        { role: "screenshot_1", confirmed: true },
      ] },
    })),
    false,
  );
  // 只有单张截图
  assert.equal(
    hasReusableConfirmedScreenshots(buildReusableExisting({
      screenshot_urls: ["https://dydata.cc/api/submission-screenshots/file?path=user/a.png"],
    })),
    false,
  );
  // 非站内截图地址
  assert.equal(
    hasReusableConfirmedScreenshots(buildReusableExisting({
      screenshot_urls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
    })),
    false,
  );
  // 前端伪造 confirmed 无法绕过：数据库 vs_previous 中未确认即阻断
  assert.equal(hasReusableConfirmedScreenshots(null), false);
});
