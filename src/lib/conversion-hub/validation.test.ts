import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScriptHash,
  validateCreateUsageRecordPayload,
  validateCreateViolationEventPayload,
} from "./validation";

test("使用记录校验要求 case_id 或 script_text 至少一个", () => {
  const result = validateCreateUsageRecordPayload({
    account_id: "123e4567-e89b-42d3-a456-426614174000",
    used_at: "2026-05-08",
    views: 1000,
    follows: 12,
  });

  assert.deepEqual(result, {
    ok: false,
    message: "case_id 或 script_text 至少提供一个",
  });
});

test("使用记录校验会阻止导粉数大于播放量", () => {
  const result = validateCreateUsageRecordPayload({
    script_text: "关注公众号领取复盘表",
    used_at: "2026-05-08",
    views: 3,
    follows: 4,
  });

  assert.deepEqual(result, {
    ok: false,
    message: "follows 不能大于 views",
  });
});

test("使用记录校验会规范化字段并提供默认值", () => {
  const result = validateCreateUsageRecordPayload({
    script_text: "  关注公众号领取复盘表  ",
    script_format: "mixed",
    account_id: "123e4567-e89b-42d3-a456-426614174000",
    used_at: "2026-05-08",
    views: "1000",
    follows: "12",
    note: "  首测  ",
    result_flag: "pass",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.script_text, "关注公众号领取复盘表");
  assert.equal(result.data.script_format, "mixed");
  assert.equal(result.data.views, 1000);
  assert.equal(result.data.follows, 12);
  assert.equal(result.data.source, "manual");
  assert.equal(result.data.note, "首测");
  assert.equal(result.data.result_flag, "pass");
});

test("使用记录校验会阻止非法 result_flag", () => {
  const result = validateCreateUsageRecordPayload({
    script_text: "测试话术",
    used_at: "2026-05-08",
    views: 10,
    follows: 1,
    result_flag: "passed",
  });

  assert.deepEqual(result, {
    ok: false,
    message: "result_flag 不合法",
  });
});

test("违规事件校验会规范化截图和申诉状态", () => {
  const result = validateCreateViolationEventPayload({
    account_id: "123e4567-e89b-42d3-a456-426614174000",
    event_type: "限流",
    occurred_at: "2026-05-08T10:00:00+08:00",
    platform_notice: "  平台提示疑似营销引流  ",
    screenshot_paths: [" user-a/notice.png ", "", "../bad.png"],
    suspected_reason: "  诱导站外  ",
    appeal_status: "申诉中",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.platform_notice, "平台提示疑似营销引流");
  assert.deepEqual(result.data.screenshot_paths, ["user-a/notice.png"]);
  assert.equal(result.data.suspected_reason, "诱导站外");
  assert.equal(result.data.appeal_status, "申诉中");
});

test("话术 hash 与数据库 md5(trim(lower(script_text))) 规则一致", () => {
  assert.equal(
    buildScriptHash("  ABC  "),
    "900150983cd24fb0d6963f7d28e17f72",
  );
});
