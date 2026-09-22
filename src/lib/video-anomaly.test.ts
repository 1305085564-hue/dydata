import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyVideoAnomalyBucket,
  deriveVideoPunishType,
  isVideoAbnormal,
  normalizeVideoAnomalyStatus,
  normalizeVideoPunishType,
  resolveVideoStatusLabel,
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

test("状态标签唯一映射：中英文枚举收敛到同一批中文标签", () => {
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "删稿" }), "删稿");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "deleted" }), "删稿");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "限流" }), "限流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "limited" }), "限流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "投流" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "traffic_boost" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "paid_boost" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "活动干预" }), "活动干预");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "campaign_intervention" }), "活动干预");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "normal" }), "正常");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "正常" }), "正常");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "pending" }), "未满24h");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: null }), "未满24h");
});

test("腰斩信号：没有更强的状态时才叫腰斩，限流/删稿优先", () => {
  assert.equal(
    resolveVideoStatusLabel({ anomalyStatus: "正常", playChangeSignal: "halve" }),
    "腰斩",
  );
  assert.equal(
    resolveVideoStatusLabel({ anomalyStatus: "限流", playChangeSignal: "halve" }),
    "限流",
  );
});

test("未知状态原样返回，不再把英文枚举直接打给用户", () => {
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "some_new_status" }), "some_new_status");
});

test("分桶互斥：一条视频最多进一个桶，腰斩不与异常状态重复计数", () => {
  // 同一条视频既是限流又腰斩：以前会同时进「限流」和「腰斩」两个桶，导致总数 68、明细相加 69
  assert.equal(
    classifyVideoAnomalyBucket({ anomaly_status: "限流", play_change_signal: "halve" }),
    "limited",
  );
  assert.equal(
    classifyVideoAnomalyBucket({ anomaly_status: "删稿", play_change_signal: "halve" }),
    "deleted",
  );
  assert.equal(
    classifyVideoAnomalyBucket({ anomaly_status: "正常", play_change_signal: "halve" }),
    "halved",
  );
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "异常", play_change_signal: null }), "abnormal");
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "投流", play_change_signal: "surge" }), "boosted");
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "normal", play_change_signal: null }), null);
});

test("分桶覆盖范围与异常队列口径一致：有桶 ⇔ 应进提醒条", () => {
  const samples = [
    { anomaly_status: "删稿", play_change_signal: null },
    { anomaly_status: "限流", play_change_signal: "halve" },
    { anomaly_status: "投流", play_change_signal: null },
    { anomaly_status: "活动干预", play_change_signal: null },
    { anomaly_status: "异常", play_change_signal: null },
    { anomaly_status: "abnormal", play_change_signal: null },
    { anomaly_status: "正常", play_change_signal: "halve" },
    { anomaly_status: "正常", play_change_signal: null },
    { anomaly_status: "normal", play_change_signal: "surge" },
  ];
  for (const video of samples) {
    const inQueue = isVideoAbnormal(video.anomaly_status) || video.play_change_signal === "halve";
    assert.equal(
      classifyVideoAnomalyBucket(video) !== null,
      inQueue,
      `口径不一致：${JSON.stringify(video)}`,
    );
  }
});

