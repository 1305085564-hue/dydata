import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveVideoPunishType,
  isVideoAbnormal,
  normalizeVideoAnomalyStatus,
  normalizeVideoPunishType,
} from "./video-anomaly";

test("视频异常状态统一收敛到 normal / abnormal 两档", () => {
  assert.equal(normalizeVideoAnomalyStatus("normal"), "normal");
  assert.equal(normalizeVideoAnomalyStatus(" 正常 "), "normal");
  assert.equal(normalizeVideoAnomalyStatus("abnormal"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("异常"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("限流"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("删稿"), "abnormal");
});

test("未满24h 不进入违规异常库", () => {
  assert.equal(isVideoAbnormal("未满24h"), false);
});

test("处罚类型兼容新枚举和旧中文状态", () => {
  assert.equal(normalizeVideoPunishType("limited"), "limited");
  assert.equal(normalizeVideoPunishType("限流"), "limited");
  assert.equal(normalizeVideoPunishType("删稿"), "deleted");
  assert.equal(deriveVideoPunishType({ anomalyStatus: "投流" }), "paid_boost");
  assert.equal(deriveVideoPunishType({ punishType: "other", anomalyStatus: "限流" }), "other");
});
