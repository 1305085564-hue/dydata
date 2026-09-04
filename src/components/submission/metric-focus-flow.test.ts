import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_TAB_ORDER,
  getNextMetricFocusTarget,
  getPrevMetricFocusTarget,
} from "./metric-focus-flow";
import type { EditableMetricKey } from "@/components/submission/提交状态机";

test("METRIC_TAB_ORDER: 包含 11 个指标且首尾项符合发布规范", () => {
  assert.equal(METRIC_TAB_ORDER.length, 11);
  assert.equal(METRIC_TAB_ORDER[0], "play_count");
  assert.equal(METRIC_TAB_ORDER[10], "completion_rate");
});

test("getNextMetricFocusTarget: 正常指标按顺序跳格到下一个指标", () => {
  assert.equal(getNextMetricFocusTarget("play_count"), "follower_gain");
  assert.equal(getNextMetricFocusTarget("follower_gain"), "follower_convert");
  assert.equal(getNextMetricFocusTarget("follower_convert"), "likes");
  assert.equal(getNextMetricFocusTarget("likes"), "comments");
  assert.equal(getNextMetricFocusTarget("comments"), "shares");
  assert.equal(getNextMetricFocusTarget("shares"), "favorites");
  assert.equal(getNextMetricFocusTarget("favorites"), "avg_play_duration");
  assert.equal(getNextMetricFocusTarget("avg_play_duration"), "bounce_rate_2s");
  assert.equal(getNextMetricFocusTarget("bounce_rate_2s"), "completion_rate_5s");
  assert.equal(getNextMetricFocusTarget("completion_rate_5s"), "completion_rate");
});

test("getNextMetricFocusTarget: 最后一个指标 (completion_rate) 按回车返回 content 聚焦文案输入区", () => {
  assert.equal(getNextMetricFocusTarget("completion_rate"), "content");
});

test("getNextMetricFocusTarget: 不在 TAB_ORDER 中的键返回 null", () => {
  assert.equal(getNextMetricFocusTarget("unknown_key" as EditableMetricKey), null);
});

test("getPrevMetricFocusTarget: 正常指标按 Shift+Enter 回退到上一个指标", () => {
  assert.equal(getPrevMetricFocusTarget("follower_gain"), "play_count");
  assert.equal(getPrevMetricFocusTarget("completion_rate"), "completion_rate_5s");
  assert.equal(getPrevMetricFocusTarget("comments"), "likes");
});

test("getPrevMetricFocusTarget: 首个指标 (play_count) 没有上一个指标，返回 null", () => {
  assert.equal(getPrevMetricFocusTarget("play_count"), null);
});

test("getPrevMetricFocusTarget: 不在 TAB_ORDER 中的键返回 null", () => {
  assert.equal(getPrevMetricFocusTarget("unknown_key" as EditableMetricKey), null);
});

test("支持自定义 tabOrder 序列", () => {
  const customOrder: EditableMetricKey[] = ["play_count", "likes", "completion_rate"];
  assert.equal(getNextMetricFocusTarget("play_count", customOrder), "likes");
  assert.equal(getNextMetricFocusTarget("likes", customOrder), "completion_rate");
  assert.equal(getNextMetricFocusTarget("completion_rate", customOrder), "content");
  assert.equal(getPrevMetricFocusTarget("likes", customOrder), "play_count");
  assert.equal(getPrevMetricFocusTarget("play_count", customOrder), null);
});
