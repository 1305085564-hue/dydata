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
    admin_conclusion: " 禁用 ",
    suggested_action: " 换话术 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    status: "verified",
    risk_level: "high",
    admin_conclusion: "禁用",
    suggested_action: "换话术",
  });
});
