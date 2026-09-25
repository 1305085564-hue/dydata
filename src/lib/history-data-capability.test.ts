import assert from "node:assert/strict";
import test from "node:test";

import { classifyHistoryData, type HistoryDataShape } from "./history-data-capability";

const complete: HistoryDataShape = {
  hasBoundVideo: true,
  hasExactlyOne24hSnapshot: true,
  hasRequiredMetrics: true,
  hasCompleteAttachments: true,
  hasOcrDetails: true,
  hasContent: true,
  hasUniqueUsageRecord: true,
  hasConsistentRelations: true,
};

test("完整历史数据可编辑", () => {
  assert.deepEqual(classifyHistoryData(complete), {
    capability: "complete_editable",
    editable: true,
    reason: "视频、指标、附属证据和关联关系完整",
  });
});

test("缺截图/OCR时仍可识别为核心可编辑，但不冒充完整数据", () => {
  const result = classifyHistoryData({
    ...complete,
    hasCompleteAttachments: false,
    hasOcrDetails: false,
  });
  assert.equal(result.capability, "editable_without_attachments");
  assert.equal(result.editable, true);
});

test("缺关键字段的历史记录只读，不因页面能打开而允许覆盖", () => {
  const result = classifyHistoryData({ ...complete, hasContent: false });
  assert.equal(result.capability, "read_only_missing_required_data");
  assert.equal(result.editable, false);
});

test("多快照或关系冲突进入人工修复，不与普通缺字段混淆", () => {
  const result = classifyHistoryData({ ...complete, hasExactlyOne24hSnapshot: false });
  assert.equal(result.capability, "needs_manual_repair");
  assert.equal(result.editable, false);
});
