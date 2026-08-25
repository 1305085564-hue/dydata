import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeContentKeywords,
  resolveSubmissionRoleUserIds,
  resolveOperatorUserId,
  validateVideoSubmitPayload,
} from "./validation";
import { buildStableUuid, buildSubmissionFingerprint, buildSubmissionRecordId } from "./stability";

const ownedAsset = (role: "screenshot_1" | "screenshot_2", confirmed = true) => ({
  role,
  url: `https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2F${role}%2Fshot.png`,
  confirmed,
  confidence_score: 1,
  screenshot_type: role === "screenshot_1" ? "data" : "retention",
});

const normalPayload = {
  account_id: "acc-1",
  video_title: "标题",
  content: "文案",
  anomaly_status: "normal",
  topic_tag: "复盘",
  assets: [ownedAsset("screenshot_1"), ownedAsset("screenshot_2")],
  metrics: {
    play_count: 100,
    follower_convert: 0,
  },
};

test("提交接口要求标题和文案，内容标签可为空", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "",
    content: "  ",
    content_keywords: [],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "标题和文案为必填项",
  });
});

test("提交接口允许内容标签为空数组", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "标题",
    content: "文案",
    content_keywords: [],
    topic_tag: "复盘",
    assets: [ownedAsset("screenshot_1"), ownedAsset("screenshot_2")],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.contentKeywords, []);
  assert.deepEqual(result.normalized.content_keywords, []);
});

test("正常提交缺任一截图时后端拒绝", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    assets: [ownedAsset("screenshot_1")],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "正常提交必须包含互动截图和完播截图",
  });
});

test("正常提交拒绝未确认的截图", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    assets: [ownedAsset("screenshot_1", false), ownedAsset("screenshot_2")],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "互动截图必须先确认",
  });
});

test("正常提交不会把字符串确认状态当成已确认", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    assets: [
      { ...ownedAsset("screenshot_1"), confirmed: "false" },
      ownedAsset("screenshot_2"),
    ],
  });

  assert.deepEqual(result, {
    ok: false,
    error: "互动截图确认状态不正确，请重新上传截图",
  });
});

test("异常提交允许无截图但仍要求文案", () => {
  const valid = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: null,
    content: "异常记录",
    anomaly_status: "abnormal",
  });
  assert.equal(valid.ok, true);

  const invalid = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: null,
    content: " ",
    anomaly_status: "abnormal",
  });
  assert.deepEqual(invalid, {
    ok: false,
    error: "异常提交时文案为必填项",
  });
});

test("正常提交要求合法且非空的话题标签", () => {
  assert.deepEqual(
    validateVideoSubmitPayload({ ...normalPayload, topic_tag: null }),
    { ok: false, error: "正常提交时话题标签为必填项" },
  );
  assert.deepEqual(
    validateVideoSubmitPayload({ ...normalPayload, topic_tag: "热点" }),
    { ok: false, error: "话题标签必须是干货或复盘" },
  );
});

test("导粉大于 0 且话术为空时后端拒绝", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    metrics: { play_count: 100, follower_convert: 3 },
    script_text: " ",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "导粉大于 0 时导粉话术为必填项",
  });
});

test("显式提供非法导粉指标时不会静默归零", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    metrics: { play_count: 100, follower_convert: "3" },
  });

  assert.deepEqual(result, { ok: false, error: "导粉指标格式不正确" });
});

test("编辑提交必须携带合法原 video_id", () => {
  assert.deepEqual(
    validateVideoSubmitPayload({
      ...normalPayload,
      mode: "edit",
      assets: [],
    }),
    { ok: false, error: "编辑提交必须携带合法 video_id" },
  );
});

test("提交接口接受责任人 UUID，并在省略时回退到提交人", () => {
  const operatorUserId = "123e4567-e89b-12d3-a456-426614174002";
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    operator_user_id: ` ${operatorUserId} `,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.normalized.operator_user_id, operatorUserId);
  assert.equal(resolveOperatorUserId(result.normalized.operator_user_id, "123e4567-e89b-12d3-a456-426614174003"), operatorUserId);
  assert.equal(resolveOperatorUserId(null, "123e4567-e89b-12d3-a456-426614174003"), "123e4567-e89b-12d3-a456-426614174003");
});

test("提交接口拒绝非 UUID 的责任人", () => {
  assert.deepEqual(
    validateVideoSubmitPayload({
      account_id: "acc-1",
      video_title: "标题",
      content: "文案",
      operator_user_id: "not-a-uuid",
    }),
    { ok: false, error: "operator_user_id 必须是合法 UUID" },
  );
});

test("提交接口分别规范化文案、剪辑和运营责任人，并把空值回退给提交人", () => {
  const scriptAuthorUserId = "123e4567-e89b-12d3-a456-426614174004";
  const videoEditorUserId = "123e4567-e89b-12d3-a456-426614174005";
  const submitterUserId = "123e4567-e89b-12d3-a456-426614174003";
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    script_author_user_id: ` ${scriptAuthorUserId} `,
    video_editor_user_id: ` ${videoEditorUserId} `,
    operator_user_id: " ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.normalized, {
    ...result.normalized,
    script_author_user_id: scriptAuthorUserId,
    video_editor_user_id: videoEditorUserId,
    operator_user_id: null,
  });
  assert.deepEqual(resolveSubmissionRoleUserIds(result.normalized, submitterUserId), {
    scriptAuthorUserId,
    videoEditorUserId,
    operatorUserId: submitterUserId,
  });
});

test("提交接口分别拒绝无效的文案和剪辑责任人", () => {
  const base = { account_id: "acc-1", video_title: "标题", content: "文案" };

  assert.deepEqual(
    validateVideoSubmitPayload({ ...base, script_author_user_id: "not-a-uuid" }),
    { ok: false, error: "script_author_user_id 必须是合法 UUID" },
  );
  assert.deepEqual(
    validateVideoSubmitPayload({ ...base, video_editor_user_id: "not-a-uuid" }),
    { ok: false, error: "video_editor_user_id 必须是合法 UUID" },
  );
});

test("内容标签会去空格、去重，并最多保留 3 个", () => {
  assert.deepEqual(
    normalizeContentKeywords([" 复盘 ", "情绪", "复盘", "", "热点", "多余标签"]),
    ["复盘", "情绪", "热点"]
  );
});

test("提交校验会返回规范化后的写入数据", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    mode: "edit",
    video_id: " 123e4567-e89b-12d3-a456-426614174000 ",
    video_url: " https://example.com/video ",
    video_title: " 标题 ",
    content: " 文案 ",
    published_at: "2025-04-08T10:20:30.000Z",
    published_at_text: " 2025-04-08 12:00 ",
    biz_date: "2025-04-08",
    anomaly_status: " 正常 ",
    punish_type: null,
    platform_notice: null,
    appeal: null,
    topic_tag: " 干货 ",
    topic_id: "123e4567-e89b-12d3-a456-426614174001",
    video_form: " 出镜 ",
    content_keywords: [" 复盘 ", "热点"],
    script_author_user_id: "123e4567-e89b-12d3-a456-426614174002",
    video_editor_user_id: "123e4567-e89b-12d3-a456-426614174003",
    operator_user_id: "123e4567-e89b-12d3-a456-426614174004",
    script_text: "  关注公众号领取复盘表  ",
    script_format: "mixed",
    assets: [],
    metrics: {
      play_count: 10,
      likes: 2,
      comments: 3,
      shares: 4,
      favorites: 5,
      follower_gain: 6,
      follower_loss: 7,
      follower_convert: 8,
      avg_play_duration: 9,
      bounce_rate_2s: 10,
      completion_rate_5s: 11,
      completion_rate: 12,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.contentKeywords, ["复盘", "热点"]);
  assert.equal(result.normalized.account_id, "acc-1");
  assert.equal(result.normalized.video_id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(result.normalized.video_url, "https://example.com/video");
  assert.equal(result.normalized.video_title, "标题");
  assert.equal(result.normalized.content, "文案");
  assert.equal(result.normalized.published_at_text, "2025-04-08 12:00");
  assert.equal(result.normalized.anomaly_status, "normal");
  assert.equal(result.normalized.topic_tag, "干货");
  assert.equal(result.normalized.topic_id, "123e4567-e89b-12d3-a456-426614174001");
  assert.equal(result.normalized.video_form, "出镜");
  assert.equal(result.normalized.script_text, "关注公众号领取复盘表");
  assert.equal(result.normalized.script_format, "mixed");
  assert.equal(result.normalized.metrics.play_count, 10);
});

test("提交接口把新状态契约收敛为 normal / abnormal", () => {
  const result = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "标题",
    content: "文案",
    anomaly_status: "异常",
    punish_type: "限流",
    platform_notice: "系统提示账号限流",
    appeal: "已提交申诉",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.normalized.anomaly_status, "abnormal");
  assert.equal(result.normalized.punish_type, "limited");
  assert.equal(result.normalized.platform_notice, "系统提示账号限流");
  assert.equal(result.normalized.appeal, "已提交申诉");
});

test("异常提交仍要求文案，但不要求标题", () => {
  const valid = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "",
    content: "异常文案",
    anomaly_status: "abnormal",
    punish_type: "deleted",
  });
  assert.equal(valid.ok, true);

  const invalid = validateVideoSubmitPayload({
    account_id: "acc-1",
    video_title: "删稿记录",
    content: " ",
    anomaly_status: "abnormal",
    punish_type: "deleted",
  });

  assert.deepEqual(invalid, {
    ok: false,
    error: "异常提交时文案为必填项",
  });
});

test("导粉为 0 时话术保持可选，不阻断旧填报链路", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    content_keywords: ["复盘"],
    script_text: "   ",
    script_format: "bad-format",
    metrics: {
      play_count: 10,
      follower_convert: 0,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.normalized.script_text, null);
  assert.equal(result.normalized.script_format, "oral");
});


test("提交接口允许 OCR 失败后保留已上传截图并手动填指标", () => {
  const result = validateVideoSubmitPayload({
    ...normalPayload,
    assets: [
      {
        role: "screenshot_1",
        url: "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fscreenshot_1%2Fdata.png",
        confirmed: true,
        confidence_score: 0,
        recognized_fields: null,
        screenshot_type: "data",
      },
      {
        role: "screenshot_2",
        url: "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fscreenshot_2%2Fretention.png",
        confirmed: true,
        confidence_score: 0,
        recognized_fields: null,
        screenshot_type: "retention",
      },
    ],
    metrics: {
      play_count: 100,
      avg_play_duration: 12.5,
      completion_rate: 33.3,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.normalized.assets[1].role, "screenshot_2");
  assert.equal(result.normalized.assets[1].confirmed, true);
  assert.equal(result.normalized.metrics.avg_play_duration, 12.5);
});

test("提交幂等 id 对同一份规范化数据保持稳定", () => {
  const base = {
    account_id: "acc-1",
    video_id: null,
    video_url: "https://example.com/video",
    video_title: "标题",
    content: "文案",
    published_at: null,
    published_at_text: null,
    biz_date: "2025-04-08",
    anomaly_status: "正常",
    topic_tag: "干货",
    video_form: null,
    content_keywords: ["复盘", "热点"],
    assets: [],
    metrics: {
      play_count: 10,
      likes: 2,
      comments: 3,
      shares: 4,
      favorites: 5,
      follower_gain: 6,
      follower_loss: 7,
      follower_convert: 8,
      avg_play_duration: 9,
      bounce_rate_2s: 10,
      completion_rate_5s: 11,
      completion_rate: 12,
    },
  };

  const fingerprintA = buildSubmissionFingerprint(base);
  const fingerprintB = buildSubmissionFingerprint({ ...base, content_keywords: ["热点", "复盘"] });

  assert.equal(fingerprintA, fingerprintB);
  assert.equal(buildSubmissionRecordId(base), buildSubmissionRecordId({ ...base, content_keywords: ["热点", "复盘"] }));
  assert.equal(buildStableUuid(fingerprintA), buildStableUuid(fingerprintA));
});

test("编辑提交使用原 video_id 作为更新主键", () => {
  const originalVideoId = "123e4567-e89b-12d3-a456-426614174099";
  const input = {
    account_id: "acc-1",
    video_id: originalVideoId,
    video_url: "https://example.com/video",
    video_title: "标题",
    content: "文案",
    published_at: null,
    published_at_text: null,
    biz_date: "2025-04-08",
    anomaly_status: "normal",
    topic_tag: "复盘",
    content_keywords: [],
    assets: [],
    metrics: {
      play_count: 10,
      likes: 0,
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
    },
  };

  assert.equal(buildSubmissionRecordId(input), originalVideoId);
});
