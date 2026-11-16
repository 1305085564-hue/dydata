import test from "node:test";
import assert from "node:assert/strict";
import { cleanMetricInputValue, normalizeFullWidthNumbers } from "./metric-input-cleaner";

test("基础数字原样返回", () => {
  assert.equal(cleanMetricInputValue("123"), "123");
  assert.equal(cleanMetricInputValue("0"), "0");
  assert.equal(cleanMetricInputValue("  456  "), "456");
  assert.equal(cleanMetricInputValue(""), "");
});

test("无效字符和负数不会进入指标值", () => {
  assert.equal(cleanMetricInputValue("abc"), "");
  assert.equal(cleanMetricInputValue("1e9"), "");
  assert.equal(cleanMetricInputValue("-123"), "");
});

test("千分位逗号自动消除", () => {
  assert.equal(cleanMetricInputValue("12,345"), "12345");
  assert.equal(cleanMetricInputValue("1,234,567"), "1234567");
  assert.equal(cleanMetricInputValue("10,000.5"), "10000.5");
});

test("万 / w / W 智能转换为真实数值", () => {
  assert.equal(cleanMetricInputValue("1.2w"), "12000");
  assert.equal(cleanMetricInputValue("1.2W"), "12000");
  assert.equal(cleanMetricInputValue("1.2万"), "12000");
  assert.equal(cleanMetricInputValue("3万"), "30000");
  assert.equal(cleanMetricInputValue("0.5w"), "5000");
  assert.equal(cleanMetricInputValue("15w"), "150000");
});

test("千 / k / K 智能转换为真实数值", () => {
  assert.equal(cleanMetricInputValue("3.5k"), "3500");
  assert.equal(cleanMetricInputValue("3K"), "3000");
  assert.equal(cleanMetricInputValue("5千"), "5000");
});

test("百分号自动剥离保留纯数字", () => {
  assert.equal(cleanMetricInputValue("35.5%"), "35.5");
  assert.equal(cleanMetricInputValue("80%"), "80");
  assert.equal(cleanMetricInputValue("12.3％"), "12.3");
});

test("时长单位秒及冒号格式自动计算秒数（仅限 duration 字段）", () => {
  assert.equal(cleanMetricInputValue("45s", "duration"), "45");
  assert.equal(cleanMetricInputValue("45秒", "duration"), "45");
  assert.equal(cleanMetricInputValue("1:20", "duration"), "80");
  assert.equal(cleanMetricInputValue("02:15", "duration"), "135");
  assert.equal(cleanMetricInputValue("1分30秒", "duration"), "90");
});

test("百分比或计数字段贴入 1:20 绝不误转为 80", () => {
  assert.equal(cleanMetricInputValue("1:20", "rate"), "");
  assert.equal(cleanMetricInputValue("1:20", "count"), "");
  // 百分比字段贴入 1.2w 不能作为数字进入表单
  assert.equal(cleanMetricInputValue("1.2w", "rate"), "");
});

test("负数输入被拒绝，避免把负数静默改成正数", () => {
  assert.equal(cleanMetricInputValue("-123", "count"), "");
  assert.equal(cleanMetricInputValue("-1.2w", "count"), "");
  assert.equal(cleanMetricInputValue("-35.5%", "rate"), "");
  assert.equal(cleanMetricInputValue("-50", "rate"), "");
});

test("全角数字自动转为半角", () => {
  assert.equal(normalizeFullWidthNumbers("１２３"), "123");
  assert.equal(cleanMetricInputValue("１２，３４５"), "12345");
  assert.equal(cleanMetricInputValue("１．２ｗ"), "12000");
});
