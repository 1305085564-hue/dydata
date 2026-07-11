import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GrowthPageContract } from "@/lib/growth-page";
import { GrowthClient } from "./growth-client";

function buildContract(overrides: Partial<GrowthPageContract> = {}): GrowthPageContract {
  return {
    identity: { profileName: "真实成员", accountCount: 1, reportCount: 12 },
    credibility: { level: "high", label: "样本充足", sampleCount: 12 },
    verdict: {
      weakestDimension: "开头留人",
      diagnosis: "5 秒完播率 28.0%，低于团队均值 41.0%。",
      prescription: "下一条开头 3 秒先抛结果，不先讲背景。",
      source: "rule",
      metric: { self: 28, teamAvg: 41, unit: "%" },
    },
    radar: [
      { dimension: "开头留人", self: 28, teamAvg: 41, rating: "weak" },
      { dimension: "中段跳出", self: 14, teamAvg: 16, rating: "strong" },
      { dimension: "整体完播", self: 14, teamAvg: 25, rating: "weak" },
      { dimension: "增长转化", self: 1.2, teamAvg: 1.1, rating: "mid" },
      { dimension: "互动吸引", self: 2.4, teamAvg: 2.1, rating: "strong" },
      { dimension: "话题爆点", self: 12000, teamAvg: 10000, rating: "strong" },
    ],
    metricsOverview: [
      { label: "发布数", value: 12, trend: 2, unit: "条" },
      { label: "总播放", value: 120000, trend: 8000, unit: "次" },
      { label: "总涨粉", value: 320, trend: 18, unit: "人" },
      { label: "平均点赞率", value: 4.2, trend: 0.4, unit: "%" },
      { label: "平均完播率", value: 28, trend: 1.5, unit: "%" },
    ],
    benchmark: {
      state: "ok",
      peer: { name: "真实对标同事", dimensionValue: 52, scriptSnippet: "开头直接说结果。" },
    },
    scriptBreakdown: {
      state: "ok",
      segments: [{ type: "hook", order: 1, content: "这是真实脚本片段。" }],
    },
    trend: [
      { date: "2026-07-10", playCount: 10000, followerGain: 20, completionRate5s: 40, completionRate: 25 },
      { date: "2026-07-11", playCount: 12000, followerGain: 28, completionRate5s: 44, completionRate: 28 },
    ],
    emptyState: { isEmpty: false },
    ...overrides,
  };
}

test("成长页空数据只显示真实引导，不渲染虚构结果", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        identity: { profileName: "新成员", accountCount: 0, reportCount: 0 },
        credibility: { level: "low", label: "样本不足，仅供参考", sampleCount: 0 },
        verdict: null,
        radar: [],
        metricsOverview: [],
        benchmark: { state: "none" },
        scriptBreakdown: { state: "none" },
        trend: [],
        emptyState: { isEmpty: true, reason: "还没有真实日报数据" },
      }),
    }),
  );

  assert.match(html, /开启内容成长体检/);
  assert.match(html, /还没有真实日报数据/);
  assert.match(html, /去提交日报/);
  assert.doesNotMatch(html, /虚拟数据|小林|阿周|AI V2/);
});

test("成长页低样本仍展示真实结论、可信度和实名对标", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        identity: { profileName: "低样本成员", accountCount: 1, reportCount: 2 },
        credibility: { level: "low", label: "样本不足，仅供参考", sampleCount: 2 },
      }),
    }),
  );

  assert.match(html, /样本不足，仅供参考/);
  assert.match(html, /低样本成员/);
  assert.match(html, /5 秒完播率 28\.0%/);
  assert.match(html, /下一条开头 3 秒先抛结果/);
  assert.match(html, /真实对标同事/);
  assert.match(html, /52\.0%/);
  assert.doesNotMatch(html, /虚拟数据|小林|阿周|AI V2/);
});

test("成长页正常样本展示完整体检、脚本与真实趋势", () => {
  const html = renderToStaticMarkup(createElement(GrowthClient, { contract: buildContract() }));

  assert.match(html, /样本充足/);
  assert.match(html, /你现在最该补的是/);
  assert.match(html, /能力画像/);
  assert.match(html, /最新视频文案拆解/);
  assert.match(html, /这是真实脚本片段/);
  assert.match(html, /近 30 天成长趋势/);
  assert.doesNotMatch(html, /虚拟数据|小林|阿周|AI V2/);
});
