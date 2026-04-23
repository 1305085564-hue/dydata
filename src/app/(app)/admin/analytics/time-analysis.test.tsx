import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TimeAnalysis } from "./time-analysis";
import {
  buildTimeAnalysisSummary,
  parsePublishedAtForAnalysis,
  type TimeAnalysisReport,
} from "./time-analysis-utils";

function getWeekdayIndex(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function buildReport(overrides: Partial<TimeAnalysisReport> = {}): TimeAnalysisReport {
  return {
    id: overrides.id ?? "report-default",
    report_date: "2026-04-02",
    play_count: 10000,
    follower_gain: 100,
    follower_convert: 10,
    published_at: "2026-04-01T19:00:00+00:00",
    uploaded_at: "2026-04-02T08:00:00+00:00",
    ...overrides,
  };
}

test("parsePublishedAtForAnalysis 兼容常见发布时间格式且保留原始小时语义", () => {
  assert.deepEqual(parsePublishedAtForAnalysis("2026-04-01T19:00:00+00:00"), {
    weekdayIndex: getWeekdayIndex(2026, 4, 1),
    hour: 19,
  });

  assert.deepEqual(parsePublishedAtForAnalysis("2026-04-01 20:15"), {
    weekdayIndex: getWeekdayIndex(2026, 4, 1),
    hour: 20,
  });

  assert.deepEqual(parsePublishedAtForAnalysis("2026/4/1 9:05"), {
    weekdayIndex: getWeekdayIndex(2026, 4, 1),
    hour: 9,
  });

  assert.deepEqual(parsePublishedAtForAnalysis("2026-04-01T21:30:45.123456+0800"), {
    weekdayIndex: getWeekdayIndex(2026, 4, 1),
    hour: 21,
  });
});

test("parsePublishedAtForAnalysis 对非法或不完整时间返回 null，不伪造发布时间", () => {
  const invalidValues = [
    null,
    undefined,
    "",
    "   ",
    "2026-04-01",
    "2026-02-30 09:00",
    "2026-04-01T24:00",
    "2026-04-01T19:70",
    "not-a-date",
  ];

  for (const value of invalidValues) {
    assert.equal(parsePublishedAtForAnalysis(value), null);
  }
});

test("buildTimeAnalysisSummary 只统计有效发布时间并生成稳定推荐窗口", () => {
  const summary = buildTimeAnalysisSummary([
    buildReport({ id: "r1", published_at: "2026-04-01T19:00:00+00:00", play_count: 12000 }),
    buildReport({ id: "r2", published_at: "2026-04-01 20:00", play_count: 22000 }),
    buildReport({ id: "r3", published_at: "2026/4/1 21:00", play_count: 18000 }),
    buildReport({ id: "missing", published_at: null, play_count: 15000 }),
    buildReport({ id: "invalid", published_at: "bad-input", play_count: 9000 }),
  ]);

  const weekdayIndex = getWeekdayIndex(2026, 4, 1);

  assert.equal(summary.totalWithPlay, 5);
  assert.equal(summary.totalEligible, 3);
  assert.equal(summary.missingPublishedAtCount, 1);
  assert.equal(summary.invalidPublishedAtCount, 1);
  assert.equal(summary.grid[weekdayIndex][19].count, 1);
  assert.equal(summary.grid[weekdayIndex][20].count, 1);
  assert.equal(summary.grid[weekdayIndex][21].count, 1);
  assert.equal(summary.maxMedianPlay, 22000);
  assert.equal(summary.bestWindow.w, weekdayIndex);
  assert.equal(summary.bestWindow.h, 19);
  assert.equal(summary.bestWindow.score, 52000);
  assert.equal(summary.bestWindow.sampleCount, 3);
  assert.equal(summary.bestWindow.coveredHours, 3);
  assert.equal(summary.bestWindow.confidence, "low");
});

test("buildTimeAnalysisSummary 全部无有效发布时间时返回空结果", () => {
  const summary = buildTimeAnalysisSummary([
    buildReport({ id: "missing-1", published_at: null }),
    buildReport({ id: "missing-2", published_at: "" }),
    buildReport({ id: "invalid", published_at: "bad-input" }),
  ]);

  assert.equal(summary.totalWithPlay, 3);
  assert.equal(summary.totalEligible, 0);
  assert.equal(summary.missingPublishedAtCount, 2);
  assert.equal(summary.invalidPublishedAtCount, 1);
  assert.equal(summary.maxMedianPlay, 0);
  assert.equal(summary.bestWindow.w, -1);
  assert.equal(summary.bestWindow.h, -1);
  assert.equal(summary.bestWindow.score, 0);
  assert.equal(summary.bestWindow.sampleCount, 0);
  assert.equal(summary.bestWindow.coveredHours, 0);
  assert.equal(summary.bestWindow.confidence, "none");
});

test("低样本不会误导出强推荐窗口", () => {
  const summary = buildTimeAnalysisSummary([
    buildReport({ id: "r1", published_at: "2026-04-01T19:00:00+00:00", play_count: 52000 }),
    buildReport({ id: "r2", published_at: "2026-04-01T20:00:00+00:00", play_count: 48000 }),
  ]);

  assert.equal(summary.totalEligible, 2);
  assert.equal(summary.bestWindow.w, -1);
  assert.equal(summary.bestWindow.h, -1);
  assert.equal(summary.bestWindow.score, 0);
  assert.equal(summary.bestWindow.sampleCount, 0);
  assert.equal(summary.bestWindow.coveredHours, 0);
  assert.equal(summary.bestWindow.confidence, "none");
});

test("时间维度分析在正常中文文案下展示推荐窗口与统计信息", () => {
  const html = renderToStaticMarkup(
    <TimeAnalysis
      reports={[
        buildReport({ id: "r1", published_at: "2026-04-01T19:00:00+00:00", play_count: 12000 }),
        buildReport({ id: "r2", published_at: "2026-04-01T20:00:00+00:00", play_count: 22000 }),
        buildReport({ id: "r3", published_at: "2026-04-01T21:00:00+00:00", play_count: 18000 }),
        buildReport({ id: "missing", published_at: null, play_count: 15000 }),
      ]}
    />,
  );

  assert.match(html, /时间维度分析/);
  assert.match(html, /推荐发布时间窗口/);
  assert.match(html, /周三 19:00 - 21:59/);
  assert.match(html, /未纳入统计数/);
  assert.match(html, /时段详情/);
});

test("全部无有效时间时展示清晰空态文案", () => {
  const html = renderToStaticMarkup(
    <TimeAnalysis
      reports={[
        buildReport({ id: "missing-1", published_at: null }),
        buildReport({ id: "missing-2", published_at: "" }),
        buildReport({ id: "invalid", published_at: "bad-input" }),
      ]}
    />,
  );

  assert.match(html, /暂无有效发布时间数据/);
  assert.match(html, /无法生成时间热力图/);
  assert.match(html, /缺少发布时间/);
  assert.match(html, /发布时间格式异常/);
});

test("低样本时仍展示热力图但不展示强推荐文案", () => {
  const html = renderToStaticMarkup(
    <TimeAnalysis
      reports={[
        buildReport({ id: "r1", published_at: "2026-04-01T19:00:00+00:00", play_count: 12000 }),
        buildReport({ id: "r2", published_at: "2026-04-01T20:00:00+00:00", play_count: 22000 }),
      ]}
    />,
  );

  assert.match(html, /时间维度分析/);
  assert.match(html, /暂无强推荐窗口/);
  assert.match(html, /暂时无法给出稳定推荐/);
  assert.doesNotMatch(html, /推荐发布时间窗口/);
});
