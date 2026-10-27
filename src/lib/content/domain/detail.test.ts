import assert from "node:assert/strict";
import test from "node:test";
import * as detail from "./detail";

test("真实作品22.2%跳出应为优质，39.6%五秒完播应为较差", () => {
  assert.equal(detail.getBounceRate2sClass(22.2, 10400), "text-status-danger");
  assert.equal(detail.getCompletionRate5sClass(39.6, 10400), "text-status-success");
});

test("详情单项颜色沿用列表已定稿的双线边界", () => {
  assert.equal(detail.getBounceRate2sClass(25, 5000), "text-status-danger");
  assert.equal(detail.getBounceRate2sClass(25.01, 5000), "text-[#141413]");
  assert.match(detail.getBounceRate2sClass(36, 5000), /text-status-success/);
  assert.equal(detail.getCompletionRate5sClass(60, 5000), "text-status-danger");
  assert.equal(detail.getCompletionRate5sClass(59.99, 5000), "text-[#141413]");
  assert.match(detail.getCompletionRate5sClass(50, 5000), /text-status-success/);
  assert.equal(detail.getCompletionRateClass(10, 5000), "text-status-danger");
  assert.equal(detail.getCompletionRateClass(9.99, 5000), "text-[#141413]");
  assert.match(detail.getCompletionRateClass(5, 5000), /text-status-success/);
});

test("不足3000播放的正常比率降灰，脏值仍优先标红，0与缺值不混淆", () => {
  assert.equal(detail.getBounceRate2sClass(22.2, 2999), "text-[#A8A29E]");
  assert.equal(detail.getCompletionRate5sClass(60, 0), "text-[#A8A29E]");
  assert.match(detail.getCompletionRate5sClass(150, 4999), /text-status-danger/);
  assert.match(detail.getCompletionRateClass(0, 5000), /text-status-success/);
  assert.equal(detail.getCompletionRateClass(null, 5000), "text-[#141413]");
  assert.equal(detail.getCompletionRateClass(undefined, 5000), "text-[#141413]");
});

test("均播时长与列表同样按40秒优质、20秒预警，并遵守样本门槛", () => {
  assert.equal(typeof detail.getAvgPlayDurationClass, "function");
  assert.equal(detail.getAvgPlayDurationClass(40, 5000), "text-status-danger");
  assert.equal(detail.getAvgPlayDurationClass(39.99, 5000), "text-[#141413]");
  assert.match(detail.getAvgPlayDurationClass(20, 5000), /text-status-success/);
  assert.equal(detail.getAvgPlayDurationClass(40, 2999), "text-[#A8A29E]");
  assert.equal(detail.getAvgPlayDurationClass(null, 5000), "text-[#141413]");
});

test("播放达到3000后指标可显示表现颜色", () => {
  assert.equal(detail.getBounceRate2sClass(25, 3000), "text-status-danger");
  assert.equal(detail.getCompletionRate5sClass(60, 3000), "text-status-danger");
  assert.equal(detail.getCompletionRateClass(10, 3000), "text-status-danger");
  assert.equal(detail.getAvgPlayDurationClass(40, 3000), "text-status-danger");
});

test("显示口径：好红差绿，边界与样本下限正确", () => {
  assert.equal(detail.getBounceRate2sClass(25, 3000), "text-status-danger");
  assert.equal(detail.getBounceRate2sClass(35, 3000), "text-[#141413]");
  assert.equal(detail.getBounceRate2sClass(35.01, 3000), "text-status-success");
  assert.equal(detail.getAvgPlayDurationClass(20, 3000), "text-status-success");
  assert.equal(detail.getAvgPlayDurationClass(40, 3000), "text-status-danger");
  assert.equal(detail.getCompletionRateClass(5, 3000), "text-status-success");
  assert.equal(detail.getCompletionRateClass(10, 3000), "text-status-danger");
});

test("核心指标仅按自身达成率和样本门槛着色", () => {
  assert.equal(detail.getCoreAchievementClass(100, 3000), "text-status-danger");
  assert.equal(detail.getCoreAchievementClass(60, 3000), "text-status-success");
  assert.equal(detail.getCoreAchievementClass(60.01, 3000), "");
  assert.equal(detail.getCoreAchievementClass(100, 2999), "");
  assert.equal(detail.getCoreAchievementClass(null, 3000), "");
});

test("5 秒完播 50% 及以下显示较差", () => {
  assert.equal(detail.getCompletionRate5sClass(50, 3000), "text-status-success");
  assert.equal(detail.getCompletionRate5sClass(50.01, 3000), "text-[#141413]");
});
