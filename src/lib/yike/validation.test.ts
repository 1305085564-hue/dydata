import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCreateItemInput,
  validateQuickCreateInput,
  validateTransitionInput,
} from "./validation";

test("快速创建只传一句话会规范成默认备忘", () => {
  const result = validateQuickCreateInput({
    rawText: "  把一刻的数据库方案整理给 Kimi  ",
    clientRequestId: " req-1 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    rawText: "把一刻的数据库方案整理给 Kimi",
    clientRequestId: "req-1",
  });
});

test("快速创建拒绝空内容和超长内容", () => {
  assert.deepEqual(validateQuickCreateInput({ rawText: "   " }), {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "rawText 不能为空",
      details: { rawText: ["rawText 不能为空"] },
    },
  });

  const longText = "字".repeat(2001);
  const result = validateQuickCreateInput({ rawText: longText });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.message, "rawText 最多 2000 字");
});

test("完整创建只要求 title 或 rawText 之一，并使用 V1 默认值", () => {
  const result = validateCreateItemInput({
    rawText: "  明天提醒 Kimi 看接口  ",
    timeBucket: "tomorrow",
    isUrgent: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.title, "明天提醒 Kimi 看接口");
  assert.equal(result.data.rawText, "明天提醒 Kimi 看接口");
  assert.equal(result.data.itemType, "memo");
  assert.equal(result.data.status, "planned");
  assert.equal(result.data.timeBucket, "tomorrow");
  assert.equal(result.data.complexity, "small");
  assert.equal(result.data.memoGranularity, "unknown");
  assert.equal(result.data.isUrgent, true);
});

test("状态流转只接受四状态内合法目标", () => {
  assert.deepEqual(validateTransitionInput({ toStatus: "doing" }), {
    ok: true,
    data: { toStatus: "doing" },
  });

  const result = validateTransitionInput({ toStatus: "paused" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.message, "toStatus 不合法");
});
