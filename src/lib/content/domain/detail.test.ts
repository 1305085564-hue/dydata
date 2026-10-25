import assert from "node:assert/strict";
import test from "node:test";
import * as detail from "./detail";

test("真实作品22.2%跳出应为优质，39.6%五秒完播应保持正常色", () => {
  assert.equal(detail.getBounceRate2sClass(22.2, 10400), "text-status-success");
  assert.equal(detail.getCompletionRate5sClass(39.6, 10400), "text-[#141413]");
});

test("详情单项颜色沿用列表已定稿的双线边界", () => {
  assert.equal(detail.getBounceRate2sClass(25, 5000), "text-status-success");
  assert.equal(detail.getBounceRate2sClass(25.01, 5000), "text-[#141413]");
  assert.match(detail.getBounceRate2sClass(36, 5000), /text-status-danger/);
  assert.equal(detail.getCompletionRate5sClass(55, 5000), "text-status-success");
  assert.equal(detail.getCompletionRate5sClass(54.99, 5000), "text-[#141413]");
  assert.match(detail.getCompletionRate5sClass(32, 5000), /text-status-danger/);
  assert.equal(detail.getCompletionRateClass(8, 5000), "text-status-success");
  assert.equal(detail.getCompletionRateClass(7.99, 5000), "text-[#141413]");
  assert.match(detail.getCompletionRateClass(2.2, 5000), /text-status-danger/);
});

test("不足5000播放的正常比率降灰，脏值仍优先标红，0与缺值不混淆", () => {
  assert.equal(detail.getBounceRate2sClass(22.2, 4999), "text-[#A8A29E]");
  assert.equal(detail.getCompletionRate5sClass(60, 0), "text-[#A8A29E]");
  assert.match(detail.getCompletionRate5sClass(150, 4999), /text-status-danger/);
  assert.match(detail.getCompletionRateClass(0, 5000), /text-status-danger/);
  assert.equal(detail.getCompletionRateClass(null, 5000), "text-[#141413]");
  assert.equal(detail.getCompletionRateClass(undefined, 5000), "text-[#141413]");
});

test("均播时长与列表同样按40秒优质、16秒预警，并遵守样本门槛", () => {
  assert.equal(typeof detail.getAvgPlayDurationClass, "function");
  assert.equal(detail.getAvgPlayDurationClass(40, 5000), "text-status-success");
  assert.equal(detail.getAvgPlayDurationClass(39.99, 5000), "text-[#141413]");
  assert.match(detail.getAvgPlayDurationClass(16, 5000), /text-status-danger/);
  assert.equal(detail.getAvgPlayDurationClass(40, 4999), "text-[#A8A29E]");
  assert.equal(detail.getAvgPlayDurationClass(null, 5000), "text-[#141413]");
});
