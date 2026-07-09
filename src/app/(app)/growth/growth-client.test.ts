import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { GrowthPageData, GrowthPageHydrationData } from "@/lib/loaders/growth-page";
import { mergeGrowthPageData, scheduleGrowthFullHydration } from "@/lib/growth-hydration";

class FakeVisibilityDocument {
  visibilityState: Document["visibilityState"];
  private readonly listeners = new Set<() => void>();

  constructor(visibilityState: Document["visibilityState"]) {
    this.visibilityState = visibilityState;
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    if (name !== "visibilitychange") return;
    this.listeners.add(listener as () => void);
  }

  removeEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    if (name !== "visibilitychange") return;
    this.listeners.delete(listener as () => void);
  }

  makeVisible() {
    this.visibilityState = "visible";
    for (const listener of this.listeners) {
      listener();
    }
  }
}

test("scheduleGrowthFullHydration 不会在挂载后立刻执行", () => {
  mock.timers.enable({ apis: ["setTimeout"] });

  let called = 0;
  const doc = new FakeVisibilityDocument("visible");
  scheduleGrowthFullHydration(() => {
    called += 1;
  }, { delayMs: 1200, doc, setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout });

  mock.timers.tick(1199);
  assert.equal(called, 0);

  mock.timers.tick(1);
  assert.equal(called, 1);
  mock.timers.reset();
});

test("scheduleGrowthFullHydration 在页面隐藏时等待可见后再开始计时", () => {
  mock.timers.enable({ apis: ["setTimeout"] });

  let called = 0;
  const doc = new FakeVisibilityDocument("hidden");
  scheduleGrowthFullHydration(() => {
    called += 1;
  }, { delayMs: 800, doc, setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout });

  mock.timers.tick(3000);
  assert.equal(called, 0);

  doc.makeVisible();
  mock.timers.tick(799);
  assert.equal(called, 0);

  mock.timers.tick(1);
  assert.equal(called, 1);
  mock.timers.reset();
});

test("scheduleGrowthFullHydration 清理后不会再触发请求", () => {
  mock.timers.enable({ apis: ["setTimeout"] });

  let called = 0;
  const doc = new FakeVisibilityDocument("visible");
  const cleanup = scheduleGrowthFullHydration(() => {
    called += 1;
  }, { delayMs: 500, doc, setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout });

  cleanup();
  mock.timers.tick(500);
  assert.equal(called, 0);
  mock.timers.reset();
});

function createInitialGrowthPageData(): GrowthPageData {
  return {
    profileName: "阿禅",
    accountCount: 1,
    reportCount: 2,
    statusCards: [
      { label: "播放", value: "2.1 万", trend: "较上周 +5%", tone: "neutral" },
      { label: "完播", value: "31%", trend: "较上周 -2%", tone: "warn" },
    ],
    capabilityCards: [
      { name: "开头吸引", score: 42, rating: { label: "弱", tone: "weak" }, metricLabel: "5秒完播", metricValue: 31, metricUnit: "%" },
      { name: "信息密度", score: 48, rating: { label: "弱", tone: "weak" }, metricLabel: "评论率", metricValue: 1.4, metricUnit: "%" },
      { name: "表达节奏", score: 51, rating: { label: "中", tone: "mid" }, metricLabel: "平均时长", metricValue: 42, metricUnit: "秒" },
      { name: "互动引导", score: 55, rating: { label: "中", tone: "mid" }, metricLabel: "分享率", metricValue: 0.8, metricUnit: "%" },
      { name: "转化承接", score: 44, rating: { label: "弱", tone: "weak" }, metricLabel: "关注率", metricValue: 0.6, metricUnit: "%" },
      { name: "选题命中", score: 49, rating: { label: "中", tone: "mid" }, metricLabel: "点赞率", metricValue: 3.2, metricUnit: "%" },
    ],
    weakBenchmarkCards: [],
    pkPanel: null,
    scriptBreakdown: {
      state: "fallback",
      rawText: "initial 文案",
      placeholder: "首屏基础版",
      segments: [],
    },
    advice: {
      source: "rule",
      diagnosis: "initial diagnosis",
      reference: "initial reference",
      action: "initial action",
    },
    myReports: [
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-30",
        play_count: 12000,
        likes: 600,
        comments: 50,
        shares: 20,
        favorites: 40,
        follower_gain: 12,
        completion_rate: "31%",
        completion_rate_5s: "43%",
      },
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-24",
        play_count: 14000,
        likes: 680,
        comments: 56,
        shares: 22,
        favorites: 43,
        follower_gain: 13,
        completion_rate: "33%",
        completion_rate_5s: "45%",
      },
    ],
    teamReports: [
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-30",
        play_count: 12000,
        likes: 600,
        comments: 50,
        shares: 20,
        favorites: 40,
        follower_gain: 12,
        completion_rate: "31%",
        completion_rate_5s: "43%",
        submitter: "阿禅",
      },
    ],
    teamMembers: [],
    summary: {
      hasEnoughData: false,
      weakestDimension: "开头吸引",
    },
    loadMode: "initial",
    isPartial: true,
  };
}

function createFullHydrationData(): GrowthPageHydrationData {
  return {
    reportCount: 4,
    statusCards: [
      { label: "播放", value: "4.8 万", trend: "较上周 +18%", tone: "good" },
      { label: "完播", value: "39%", trend: "较上周 +6%", tone: "good" },
    ],
    capabilityCards: [
      { name: "开头吸引", score: 66, rating: { label: "中", tone: "mid" }, metricLabel: "5秒完播", metricValue: 39, metricUnit: "%" },
      { name: "信息密度", score: 63, rating: { label: "中", tone: "mid" }, metricLabel: "评论率", metricValue: 2.2, metricUnit: "%" },
      { name: "表达节奏", score: 68, rating: { label: "中", tone: "mid" }, metricLabel: "平均时长", metricValue: 38, metricUnit: "秒" },
      { name: "互动引导", score: 72, rating: { label: "强", tone: "good" }, metricLabel: "分享率", metricValue: 1.3, metricUnit: "%" },
      { name: "转化承接", score: 64, rating: { label: "中", tone: "mid" }, metricLabel: "关注率", metricValue: 1.1, metricUnit: "%" },
      { name: "选题命中", score: 69, rating: { label: "中", tone: "mid" }, metricLabel: "点赞率", metricValue: 4.8, metricUnit: "%" },
    ],
    weakBenchmarkCards: [
      { dimension: "开头吸引", leaderName: "小王", gapText: "高 8 个点", actionHint: "前 2 秒先给结论", scriptSnippet: "先说结论再解释" },
    ],
    pkPanel: {
      leftName: "阿禅",
      rightName: "小王",
      rows: [{ label: "5秒完播", leftValue: "39%", rightValue: "47%", gap: "-8%" }],
    },
    scriptBreakdown: {
      state: "structured",
      rawText: "full 文案",
      placeholder: "结构化拆解",
      segments: [{ id: "seg-1", label: "开头钩子", content: "先抛结论", tone: "good" }],
    },
    advice: {
      source: "rule",
      diagnosis: "full diagnosis",
      reference: "full reference",
      action: "full action",
    },
    myReports: [
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-30",
        play_count: 12000,
        likes: 600,
        comments: 50,
        shares: 20,
        favorites: 40,
        follower_gain: 12,
        completion_rate: "31%",
        completion_rate_5s: "43%",
      },
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-24",
        play_count: 14000,
        likes: 680,
        comments: 56,
        shares: 22,
        favorites: 43,
        follower_gain: 13,
        completion_rate: "33%",
        completion_rate_5s: "45%",
      },
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-17",
        play_count: 17000,
        likes: 760,
        comments: 60,
        shares: 28,
        favorites: 48,
        follower_gain: 16,
        completion_rate: "36%",
        completion_rate_5s: "49%",
      },
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-08",
        play_count: 21000,
        likes: 920,
        comments: 74,
        shares: 33,
        favorites: 55,
        follower_gain: 20,
        completion_rate: "39%",
        completion_rate_5s: "54%",
      },
    ],
    teamReports: [
      {
        user_id: "user-1",
        account_id: "acc-self",
        report_date: "2026-05-30",
        play_count: 12000,
        likes: 600,
        comments: 50,
        shares: 20,
        favorites: 40,
        follower_gain: 12,
        completion_rate: "31%",
        completion_rate_5s: "43%",
        submitter: "阿禅",
      },
      {
        user_id: "user-2",
        account_id: "acc-peer",
        report_date: "2026-05-29",
        play_count: 36000,
        likes: 2000,
        comments: 180,
        shares: 110,
        favorites: 150,
        follower_gain: 48,
        completion_rate: "47%",
        completion_rate_5s: "61%",
        submitter: "小王",
      },
    ],
    teamMembers: [{ id: "user-2", name: "小王", scores: [78, 75, 72, 74, 70, 73] }],
    summary: {
      hasEnoughData: true,
      weakestDimension: "转化承接",
    },
    loadMode: "full",
    isPartial: false,
  };
}

test("mergeGrowthPageData 在 full 补拉后会升级页面关键字段", () => {
  const initialData = createInitialGrowthPageData();
  const fullData = createFullHydrationData();

  const merged = mergeGrowthPageData(initialData, fullData);

  assert.equal(merged.profileName, "阿禅");
  assert.equal(merged.accountCount, 1);
  assert.equal(merged.loadMode, "full");
  assert.equal(merged.isPartial, false);
  assert.equal(merged.reportCount, 4);
  assert.equal(merged.summary.hasEnoughData, true);
  assert.equal(merged.summary.weakestDimension, "转化承接");
  assert.equal(merged.statusCards[0]?.value, "4.8 万");
  assert.equal(merged.capabilityCards[0]?.score, 66);
  assert.equal(merged.myReports.length, 4);
  assert.equal(merged.teamReports[1]?.submitter, "小王");
  assert.equal(merged.advice.diagnosis, "full diagnosis");
  assert.equal(merged.pkPanel?.rightName, "小王");
  assert.equal(merged.scriptBreakdown.state, "structured");
});
