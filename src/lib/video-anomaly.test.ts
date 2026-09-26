import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyVideoAnomalyBucket,
  deriveVideoPunishType,
  findRetiredVideoAnomalyInput,
  formatAnomalyStatusText,
  isRetiredVideoAnomalyStatus,
  isVideoAbnormal,
  normalizeVideoAnomalyStatus,
  normalizeVideoPunishType,
  resolveVideoStatusLabel,
  VIDEO_ABNORMAL_STATUS_VALUES,
} from "./video-anomaly";

test("现役选项集合只有正常/异常/限流/删稿，不再接受投流/活动干预", () => {
  assert.ok(!(VIDEO_ABNORMAL_STATUS_VALUES as readonly string[]).includes("投流"));
  assert.ok(!(VIDEO_ABNORMAL_STATUS_VALUES as readonly string[]).includes("活动干预"));

  assert.equal(normalizeVideoAnomalyStatus("normal"), "normal");
  assert.equal(normalizeVideoAnomalyStatus(" 正常 "), "normal");
  assert.equal(normalizeVideoAnomalyStatus("abnormal"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("异常"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("限流"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("删稿"), "abnormal");
});

test("已下线类型归入异常读口径，但写入守卫会明确拒绝", () => {
  assert.equal(normalizeVideoAnomalyStatus("投流"), "abnormal");
  assert.equal(normalizeVideoAnomalyStatus("活动干预"), "abnormal");
  assert.equal(isVideoAbnormal("投流"), true);

  assert.equal(isRetiredVideoAnomalyStatus("投流"), true);
  assert.equal(isRetiredVideoAnomalyStatus("paid_boost"), true);
  assert.equal(isRetiredVideoAnomalyStatus("活动干预"), true);
  assert.equal(isRetiredVideoAnomalyStatus("campaign_intervention"), true);
  assert.equal(isRetiredVideoAnomalyStatus("限流"), false);
  assert.equal(isRetiredVideoAnomalyStatus("limited"), false);

  assert.equal(
    findRetiredVideoAnomalyInput({ anomalyStatus: "投流" }),
    "投流",
  );
  assert.equal(
    findRetiredVideoAnomalyInput({ punishType: "paid_boost" }),
    "投流",
  );
  assert.equal(
    findRetiredVideoAnomalyInput({ anomalyStatus: "活动干预" }),
    "活动干预",
  );
  assert.equal(findRetiredVideoAnomalyInput({ anomalyStatus: "限流" }), null);
  assert.equal(findRetiredVideoAnomalyInput({ punishType: "deleted" }), null);
  assert.equal(findRetiredVideoAnomalyInput({}), null);
});

test("未满24h 不进入违规异常库", () => {
  assert.equal(isVideoAbnormal("未满24h"), false);
});

test("处罚类型兼容新枚举和旧中文状态", () => {
  assert.equal(normalizeVideoPunishType("limited"), "limited");
  assert.equal(normalizeVideoPunishType("限流"), "limited");
  assert.equal(normalizeVideoPunishType("删稿"), "deleted");
  // 已下线枚举不再接受：归一化返回 null，由写入守卫拒绝，不能静默变成「其他」
  assert.equal(normalizeVideoPunishType("paid_boost"), null);
  assert.equal(normalizeVideoPunishType("campaign_intervention"), null);
  assert.equal(deriveVideoPunishType({ anomalyStatus: "投流" }), null);
  assert.equal(deriveVideoPunishType({ punishType: "other", anomalyStatus: "限流" }), "other");
});

test("旧行读兼容：历史标签照常显示，不会崩溃也不会自动转换", () => {
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "删稿" }), "删稿");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "deleted" }), "删稿");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "限流" }), "限流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "limited" }), "限流");
  // 现役录入已无这两项：旧行仍按原中文标签显示，不打英文枚举给用户
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "投流" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "traffic_boost" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "paid_boost" }), "投流");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "活动干预" }), "活动干预");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "campaign_intervention" }), "活动干预");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "normal" }), "正常");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "正常" }), "正常");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: "pending" }), "未满24h");
  assert.equal(resolveVideoStatusLabel({ anomalyStatus: null }), "未满24h");

  assert.equal(formatAnomalyStatusText("paid_boost"), "投流");
  assert.equal(formatAnomalyStatusText("campaign_intervention"), "活动干预");
  assert.equal(formatAnomalyStatusText(null), "正常");
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
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "normal", play_change_signal: null }), null);
});

test("分桶收口：已下线类型不再单独成桶，按读口径记入异常", () => {
  // 旧行不能从提醒条里消失：中英文旧值都归入「异常」，不保留 boosted 桶
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "投流", play_change_signal: "surge" }), "abnormal");
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "paid_boost", play_change_signal: null }), "abnormal");
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "活动干预", play_change_signal: null }), "abnormal");
  assert.equal(classifyVideoAnomalyBucket({ anomaly_status: "campaign_intervention", play_change_signal: null }), "abnormal");
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

