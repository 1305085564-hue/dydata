import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCreateTestRecordPayload,
  validateCreateViolationPayload,
  validateReviewViolationPayload,
} from "./validation";

test("提交案例要求话术、违规状态和合法分类", () => {
  assert.deepEqual(validateCreateViolationPayload({}), {
    ok: false,
    message: "script_text 为必填项",
  });

  assert.deepEqual(
    validateCreateViolationPayload({
      script_text: "测试话术",
      is_violation: true,
      category: "不存在",
    }),
    {
      ok: false,
      message: "category 不合法",
    },
  );
});

test("提交案例会规范化可选字段并限制数组数量", () => {
  const result = validateCreateViolationPayload({
    script_text: "  测试话术  ",
    is_violation: false,
    category: "直播",
    account_id: " acc-1 ",
    scene_description: "  画面描述  ",
    screenshot_paths: [" user/date/a.png ", "user/date/a.png", "user/date/b.webp"],
    result: " 正常过审 ",
    tags: [" 导粉 ", "导粉", "过审"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.script_text, "测试话术");
  assert.equal(result.data.account_id, "acc-1");
  assert.equal(result.data.scene_description, "画面描述");
  assert.deepEqual(result.data.screenshot_paths, ["user/date/a.png", "user/date/b.webp"]);
  assert.deepEqual(result.data.tags, ["导粉", "过审"]);
});

test("测试记录要求 passed 为布尔值", () => {
  assert.deepEqual(validateCreateTestRecordPayload({ passed: "true" }), {
    ok: false,
    message: "passed 必须为布尔值",
  });

  const result = validateCreateTestRecordPayload({
    account_id: " acc-1 ",
    passed: true,
    note: "  备注  ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    account_id: "acc-1",
    passed: true,
    note: "备注",
  });
});

test("复核只允许终态和合法风险等级", () => {
  assert.deepEqual(validateReviewViolationPayload({ status: "submitted" }), {
    ok: false,
    message: "status 不合法",
  });

  assert.deepEqual(
    validateReviewViolationPayload({
      status: "verified",
      risk_level: "critical",
    }),
    {
      ok: false,
      message: "risk_level 不合法",
    },
  );

  const result = validateReviewViolationPayload({
    status: "verified",
    risk_level: "high",
    usage_state: "banned",
    promotion_level: "watching",
    admin_conclusion: " 禁用 ",
    suggested_action: " 换话术 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    status: "verified",
    risk_level: "high",
    usage_state: "banned",
    promotion_level: "watching",
    admin_conclusion: "禁用",
    suggested_action: "换话术",
  });
});

test("复核校验会阻止非法使用状态和推广等级", () => {
  assert.deepEqual(
    validateReviewViolationPayload({
      status: "verified",
      usage_state: "wrong",
    }),
    {
      ok: false,
      message: "usage_state 不合法",
    },
  );

  assert.deepEqual(
    validateReviewViolationPayload({
      status: "verified",
      promotion_level: "priority",
    }),
    {
      ok: false,
      message: "promotion_level 不合法",
    },
  );
});

test("复核校验在未传 usage_state 和 promotion_level 时不会强制回填 null", () => {
  const result = validateReviewViolationPayload({
    status: "rejected",
    risk_level: null,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal("usage_state" in result.data, false);
  assert.equal("promotion_level" in result.data, false);
});

test("提交案例的 platforms 默认抖音并支持去重", () => {
  const noPlatforms = validateCreateViolationPayload({
    script_text: "话术",
    is_violation: false,
    category: "短视频",
  });
  assert.equal(noPlatforms.ok, true);
  if (!noPlatforms.ok) return;
  assert.deepEqual(noPlatforms.data.platforms, ["抖音"]);

  const dedup = validateCreateViolationPayload({
    script_text: "话术",
    is_violation: false,
    category: "短视频",
    platforms: ["抖音", "视频号", "抖音"],
  });
  assert.equal(dedup.ok, true);
  if (!dedup.ok) return;
  assert.deepEqual(dedup.data.platforms, ["抖音", "视频号"]);
});

test("提交案例拒绝未知平台和空 platforms", () => {
  assert.deepEqual(
    validateCreateViolationPayload({
      script_text: "话术",
      is_violation: false,
      category: "短视频",
      platforms: ["B 站"],
    }),
    { ok: false, message: "platforms 包含未知平台" },
  );

  assert.deepEqual(
    validateCreateViolationPayload({
      script_text: "话术",
      is_violation: false,
      category: "短视频",
      platforms: [],
    }),
    { ok: false, message: "platforms 至少选 1 个" },
  );
});

test("复核校验接受合法的踩雷点标签数组并去重", () => {
  const tagId = "11111111-2222-4333-8444-555555555555";
  const result = validateReviewViolationPayload({
    status: "verified",
    risk_level: "high",
    reason_tag_ids: [` ${tagId} `, tagId],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.reason_tag_ids, [tagId]);
});

test("复核校验拒绝非数组或非 UUID 的踩雷点标签", () => {
  assert.deepEqual(
    validateReviewViolationPayload({
      status: "verified",
      reason_tag_ids: "not-an-array",
    }),
    { ok: false, message: "reason_tag_ids 不合法" },
  );

  assert.deepEqual(
    validateReviewViolationPayload({
      status: "verified",
      reason_tag_ids: ["not-a-uuid"],
    }),
    { ok: false, message: "reason_tag_ids 包含非法 UUID" },
  );
});
