import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GrowthPageContract, GrowthStage } from "@/lib/growth-page";
import { GrowthClient } from "./growth-client";

function buildStage(overrides: Partial<GrowthStage> = {}): GrowthStage {
  return {
    phase: "observation",
    lifetimeReportCount: 12,
    lastReportDate: "2026-07-16",
    daysSinceLastReport: 0,
    isStale: false,
    windowReportCount: 12,
    teamActiveCount: 3,
    ...overrides,
  };
}

function buildContract(overrides: Partial<GrowthPageContract> = {}): GrowthPageContract {
  return {
    identity: { profileName: "真实成员", accountCount: 1, reportCount: 12 },
    credibility: { level: "high", label: "样本充足", sampleCount: 12 },
    stage: buildStage(),
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

test("新人（全历史 0 份）只显示真实引导，不渲染虚构结果", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        identity: { profileName: "新成员", accountCount: 0, reportCount: 0 },
        credibility: { level: "low", label: "样本不足，仅供参考", sampleCount: 0 },
        stage: buildStage({
          phase: "accumulation",
          lifetimeReportCount: 0,
          lastReportDate: null,
          daysSinceLastReport: null,
          isStale: false,
          windowReportCount: 0,
        }),
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

test("累积期只给进度和招式：进度卡、教练卡、追赶条、锁定雷达，不出诊断", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        identity: { profileName: "低样本成员", accountCount: 1, reportCount: 2 },
        credibility: { level: "low", label: "样本不足，仅供参考", sampleCount: 2 },
        stage: buildStage({
          phase: "accumulation",
          lifetimeReportCount: 2,
          lastReportDate: "2026-07-15",
          daysSinceLastReport: 1,
          windowReportCount: 2,
        }),
      }),
    }),
  );

  assert.match(html, /再积累 8 份日报/);
  assert.match(html, /累积期/);
  assert.match(html, /提交今日日报/);
  assert.match(html, /下一条视频 · 一个建议/);
  assert.match(html, /下一条开头 3 秒先抛结果/);
  assert.match(html, /同伴 · 追赶视角/);
  assert.match(html, /真实对标同事/);
  assert.match(html, /不画假形状/);
  assert.match(html, /2\/10 份/);
  assert.match(html, /满 10 份有效日报后点亮/);
  assert.doesNotMatch(html, /你现在最该补的是/);
  assert.doesNotMatch(html, /排行榜 · 全局排行/);
  assert.doesNotMatch(html, /\+100%|↗/);
});

test("累积期断流提示并入进度卡，不重复出现", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        stage: buildStage({
          phase: "accumulation",
          lifetimeReportCount: 5,
          lastReportDate: "2026-07-01",
          daysSinceLastReport: 15,
          isStale: true,
          windowReportCount: 2,
        }),
      }),
    }),
  );

  const matches = html.match(/数据停在 7月1日 · 已停 15 天/g) ?? [];
  assert.equal(matches.length, 1);
  assert.match(html, /去同步/);
});

test("观察期诊断卡回归并标注样本口径，比例指标点亮，同伴为双人对比", () => {
  const html = renderToStaticMarkup(createElement(GrowthClient, { contract: buildContract() }));

  assert.match(html, /观察期 · 近 30 天 12 份样本/);
  assert.match(html, /你现在最该补的是/);
  assert.match(html, /基于近 30 天 12 份日报 · 样本累积中/);
  assert.match(html, /28\.0%/);
  assert.match(html, /4\.2%/);
  assert.match(html, /点赞数占总播放的比例/);
  assert.match(html, /该学谁 · 双人对比/);
  assert.match(html, /最新视频文案拆解/);
  assert.match(html, /能力画像/);
  assert.doesNotMatch(html, /再积累/);
  assert.doesNotMatch(html, /排行榜 · 全局排行/);
});

test("成熟期启用榜单形态，诊断卡不再标注样本累积", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        stage: buildStage({
          phase: "mature",
          lifetimeReportCount: 40,
          windowReportCount: 35,
          teamActiveCount: 8,
        }),
      }),
    }),
  );

  assert.match(html, /成熟期 · 样本充足/);
  assert.match(html, /你现在最该补的是/);
  assert.match(html, /排行榜 · 全局排行/);
  assert.match(html, /该学谁/);
  assert.match(html, /开头直接说结果/);
  assert.doesNotMatch(html, /样本累积中/);
  assert.doesNotMatch(html, /追赶视角/);
});

test("重度断流（窗口空但全历史有数据）主卡冻结而不是误报新人空态", () => {
  const html = renderToStaticMarkup(
    createElement(GrowthClient, {
      contract: buildContract({
        verdict: null,
        radar: [],
        metricsOverview: [],
        benchmark: { state: "none" },
        scriptBreakdown: { state: "none" },
        trend: [],
        stage: buildStage({
          phase: "observation",
          lifetimeReportCount: 20,
          lastReportDate: "2026-06-01",
          daysSinceLastReport: 45,
          isStale: true,
          windowReportCount: 0,
          teamActiveCount: 6,
        }),
      }),
    }),
  );

  assert.match(html, /体检暂停/);
  assert.match(html, /近 30 天没有新日报/);
  assert.match(html, /数据停在 6月1日 · 已停 45 天/);
  assert.match(html, /去同步今日数据/);
  assert.doesNotMatch(html, /开启内容成长体检/);
  assert.doesNotMatch(html, /还没有真实日报数据/);
});
