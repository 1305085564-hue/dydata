import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  getContentQualityStatusText,
  getContentQualityStatusShortText,
} from "@/lib/collaboration/content-quality-contract";

const source = [
  "src/app/(app)/admin/content/content-list.tsx",
  "src/app/(app)/admin/content/content-list-table.tsx",
  "src/app/(app)/admin/content/content-list-table-header.tsx",
  "src/app/(app)/admin/content/content-list-view-controls.tsx",
  "src/app/(app)/admin/content/content-list-filters-view.tsx",
  "src/app/(app)/admin/content/content-list-secondary-filters.tsx",
  "src/lib/content/domain/content-list.ts",
  "src/lib/content/domain/content-list-state.ts",
  "src/lib/content/data/content-list.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

test("视频复盘列表支持完整/宽松指标视图切换，评级与留存达成常驻", () => {
  assert.match(source, /metricViewMode/);
  assert.match(source, />完整</);
  assert.match(source, />宽松</);

  for (const label of [
    "点赞",
    "评论",
    "分享",
    "收藏",
    "互动率",
    "2s跳出",
    "5s完播",
    "均播",
    "完播",
    "发布时间",
  ]) {
    assert.match(source, new RegExp(`<span>${label}<\\/span>`));
  }
  assert.match(source, /data-col-key="retention_achievement"/);
  assert.match(source, /data-col-key="overall_grade"/);
});

test("视频复盘列表空态占位单元格支持动态跨列（宽松13列/完整17列）", () => {
  assert.match(source, /dynamicColSpan = isSpacious \? 13 : 17/);
  assert.match(source, /colSpan=\{dynamicColSpan\}/);
});

test("桌面端表头与表体第14-16列严格对齐为 互动率 → 留存达成 → 评级，且补齐悬停列联动", () => {
  const header = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/content-list-table-header.tsx"), "utf8");
  const table = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/content-list-table.tsx"), "utf8");

  const headerOrder = [...header.matchAll(/<th\b[^>]*data-col-key="([^"]+)"/g)].map((m) => m[1]);
  const bodyOrder = [...table.matchAll(/<td\b[^>]*data-col-key="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(headerOrder, bodyOrder, "表头与表体列顺序必须完全一致");
  assert.equal(headerOrder.length, 17);
  assert.deepEqual(headerOrder.slice(-4), [
    "interaction_rate",
    "retention_achievement",
    "overall_grade",
    "published_at",
  ]);
  assert.match(header, /hoveredColKey === "retention_achievement"/);
  assert.match(header, /hoveredColKey === "overall_grade"/);
  assert.match(table, /hoveredColKey === "retention_achievement"/);
  assert.match(table, /hoveredColKey === "overall_grade"/);
});

test("详情播放卡片对齐综合评级播放门槛且不再硬编码10万爆款文案", () => {
  const metrics = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/detail/content-detail-metrics.tsx"), "utf8");
  const dialog = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/content-detail-dialog.tsx"), "utf8");
  const evidence = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/detail/content-detail-evidence.tsx"), "utf8");

  assert.doesNotMatch(metrics, /爆款层级/);
  assert.match(metrics, /已过 1\.5 万线（评级不封顶）/);
  assert.match(metrics, /不足 2 千（直接判普）/);
  assert.doesNotMatch(dialog, /ID:\s*\{video/);
  assert.doesNotMatch(dialog, /<Flame\b/);
  assert.doesNotMatch(evidence, /手机端截图|电脑端宽图|>点击全屏</);
  assert.doesNotMatch(evidence, /group-hover:scale-\[1\.01\]/);
});

test("异常状态使用统一橙色标记（腰斩已下线，不再单独成标记）", () => {
  assert.match(source, /status === "abnormal"/);
  assert.match(source, /status === "异常"/);
  assert.match(source, /variant: "warning" as const/);
});

test("窄屏列表通过表格容器横向滚动查看全部列", () => {
  assert.match(source, /import \{ Table \} from "@\/components\/ui\/table"/);
  assert.match(source, /<Table className=\{cn\([\s\S]*?min-w-\[960px\]/);
});

test("未评级原因短文案与长文案同源，未知状态不等于硬编码待采集", () => {
  const unknownStatus = "future_unsupported_status" as unknown as Parameters<typeof getContentQualityStatusShortText>[0];
  const longText = getContentQualityStatusText(unknownStatus);
  const shortText = getContentQualityStatusShortText(unknownStatus);

  assert.equal(shortText, longText, "未知 status 时短文案与长文案同源");
  assert.notEqual(shortText, "待采集", "未知 status 不等于硬编码「待采集」");
  assert.equal(shortText, "数据未就绪");
});

test("列表保留评级列，无硬编码待采集兜底，无其他·点赞", () => {
  assert.match(source, /data-col-key="overall_grade"/);
  assert.doesNotMatch(source, /"其他·点赞"/);
  assert.doesNotMatch(source, /status === "unlinked"\s*\?\s*"未关联"/);
});
