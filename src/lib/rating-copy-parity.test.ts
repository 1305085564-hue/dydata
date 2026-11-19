import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
} from "./breakout-rating";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "./topics/metrics";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("评级说明文案中的播放线与应用常量一致", () => {
  const contentDetail = readSource(
    "src/app/(app)/admin/content/detail/content-detail-metrics.tsx",
  );
  assert.equal(KPI_PLAY_EXCELLENT, 15_000, "优线常量不是 1.5 万，请同步评级规则");
  assert.equal(KPI_PLAY_GOOD, 5_000, "良线常量不是 5 千，请同步评级规则");
  assert.equal(KPI_PLAY_FLOOR, 2_000, "起评线常量不是 2 千，请同步评级规则");
  assert.match(contentDetail, /1\.5 万/, "页面缺少 1.5 万线说明，请同步 content-detail-metrics.tsx");
  assert.match(contentDetail, /5 千/, "页面缺少 5 千线说明，请同步 content-detail-metrics.tsx");
  assert.match(contentDetail, /2 千/, "页面缺少 2 千线说明，请同步 content-detail-metrics.tsx");
});

test("选题库的 3 万说明与自动收录门槛一致", () => {
  const filters = readSource("src/components/topics-v2/TopicMoreFiltersDrawer.tsx");
  const emptyState = readSource("src/components/topics-v2/pool/PoolEmptyState.tsx");
  assert.equal(TOPIC_LIBRARY_QUALIFY_PLAY_COUNT, 30_000, "选题收录门槛常量不是 3 万，请同步规则");
  assert.match(filters, /3 万/, "更多筛选缺少 3 万说明，请同步 TopicMoreFiltersDrawer.tsx");
  assert.match(emptyState, /3 万/, "选题库空态缺少 3 万说明，请同步 PoolEmptyState.tsx");
});
