import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
} from "./breakout-rating";
import { CALIBER } from "./metrics/caliber";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function formatThreshold(value: number) {
  if (value >= 10_000) return `${value / 10_000} 万`;
  if (value >= 1_000) return `${value / 1_000} 千`;
  return value.toLocaleString("zh-CN");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("评级说明文案中的播放线与应用常量一致", () => {
  const contentDetail = readSource(
    "src/app/(app)/admin/content/detail/content-detail-metrics.tsx",
  );
  const excellent = `${formatThreshold(KPI_PLAY_EXCELLENT)}线`;
  const good = `${formatThreshold(KPI_PLAY_GOOD)}线`;
  const floor = `不足 ${formatThreshold(KPI_PLAY_FLOOR)}`;
  assert.match(contentDetail, new RegExp(escapeRegExp(excellent)), `页面缺少 ${excellent} 说明，请同步 content-detail-metrics.tsx 的 getPlayThresholdLabel`);
  assert.match(contentDetail, new RegExp(escapeRegExp(good)), `页面缺少 ${good} 说明，请同步 content-detail-metrics.tsx 的 getPlayThresholdLabel`);
  assert.match(contentDetail, new RegExp(escapeRegExp(floor)), `页面缺少 ${floor} 说明，请同步 content-detail-metrics.tsx 的 getPlayThresholdLabel`);
});

test("选题库的 3 万说明与自动收录门槛一致", () => {
  const filters = readSource("src/components/topics-v2/TopicMoreFiltersDrawer.tsx");
  const emptyState = readSource("src/components/topics-v2/pool/PoolEmptyState.tsx");
  const label = formatThreshold(CALIBER.hitMinPlay);
  assert.match(filters, new RegExp(escapeRegExp(label)), `更多筛选缺少 ${label} 说明，请同步 TopicMoreFiltersDrawer.tsx`);
  assert.match(emptyState, new RegExp(escapeRegExp(label)), `选题库空态缺少 ${label} 说明，请同步 PoolEmptyState.tsx`);
});
