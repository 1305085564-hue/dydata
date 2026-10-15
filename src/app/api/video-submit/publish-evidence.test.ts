import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublishEvidenceFailureMessage, shouldCheckPublishDeadline } from "./route-core";

test("72 小时补交门禁只豁免异常上报模式，限流与删稿照常受约束", () => {
  // 限流 / 删稿是作品状态，不是豁免理由：否则标一个限流就能无审批补录任意旧日期。
  assert.equal(shouldCheckPublishDeadline({ mode: "abnormal" }), false);
  assert.equal(shouldCheckPublishDeadline({ mode: "create" }), true);
  assert.equal(shouldCheckPublishDeadline({ mode: "edit" }), true);
});

test("限流或正常作品缺少完播截图时仍指向可自助补救", () => {
  assert.match(
    resolvePublishEvidenceFailureMessage({
      reason: "missing_published_at",
      hasPublishScreenshot: false,
      punishType: "limited",
    }),
    /重新上传.*完播截图/,
  );
  assert.match(
    resolvePublishEvidenceFailureMessage({
      reason: "missing_published_at",
      hasPublishScreenshot: false,
      punishType: null,
    }),
    /重新上传.*完播截图/,
  );
});

test("手上有完播截图时，即使删稿也先指向重传，不直接推给管理员", () => {
  assert.match(
    resolvePublishEvidenceFailureMessage({
      reason: "missing_published_at",
      hasPublishScreenshot: true,
      punishType: "deleted",
    }),
    /重新上传.*完播截图/,
  );
});

test("删稿且没有完播截图时才指向管理员", () => {
  assert.equal(
    resolvePublishEvidenceFailureMessage({
      reason: "missing_published_at",
      hasPublishScreenshot: false,
      punishType: "deleted",
    }),
    "这条无法自动补交，请联系管理员确认。",
  );
});
