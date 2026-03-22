import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdviceSections,
  buildGrowthDimensionCards,
  buildScriptBreakdownData,
  buildWeakBenchmarkCards,
} from "./growth-page";

type MetricsReport = {
  user_id: string;
  account_id: string;
  report_date: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  completion_rate: string | null;
  completion_rate_5s: string | null;
  content?: string | null;
};

type MetricsAccount = {
  id: string;
  profile_id: string;
  name: string;
  content_direction: string | null;
  presentation_format: string | null;
};

function buildReport(overrides: Partial<MetricsReport> = {}): MetricsReport {
  return {
    user_id: "self-user",
    account_id: "self-account",
    report_date: "2026-03-20",
    play_count: 1000,
    likes: 50,
    comments: 20,
    shares: 10,
    favorites: 5,
    follower_gain: 8,
    completion_rate: "30",
    completion_rate_5s: "45",
    content: "原始文案",
    ...overrides,
  };
}

function buildAccount(overrides: Partial<MetricsAccount> = {}): MetricsAccount {
  return {
    id: "self-account",
    profile_id: "self-user",
    name: "自己",
    content_direction: "职场",
    presentation_format: "口播",
    ...overrides,
  };
}

test("buildGrowthDimensionCards 生成六维能力卡并给出样本量交通灯", () => {
  const cards = buildGrowthDimensionCards({
    myReports: Array.from({ length: 8 }, (_, index) =>
      buildReport({
        report_date: `2026-03-${String(20 - index).padStart(2, "0")}`,
        play_count: 1000 + index * 50,
        likes: 60,
        comments: 30,
        shares: 15,
        favorites: 12,
        follower_gain: 10,
        completion_rate: "36",
        completion_rate_5s: "52",
      }),
    ),
    teamReports: Array.from({ length: 36 }, (_, index) =>
      buildReport({
        user_id: `team-${index}`,
        account_id: `team-account-${index}`,
        report_date: `2026-03-${String((index % 20) + 1).padStart(2, "0")}`,
        play_count: 900,
        likes: 30,
        comments: 8,
        shares: 5,
        favorites: 4,
        follower_gain: 4,
        completion_rate: "25",
        completion_rate_5s: "35",
      }),
    ),
  });

  assert.equal(cards.length, 6);
  assert.deepEqual(
    cards.map((item: { name: string }) => item.name),
    ["开头留人", "中段跳出", "整体完播", "增长转化", "互动吸引", "话题爆点"],
  );
  assert.equal(cards[0].sample.signal, "red");
  assert.match(cards[0].sample.label, /8/);
  assert.match(cards[0].sample.hint, /样本不足/);
  assert.equal(cards[2].sample.signal, "green");
  assert.match(cards[2].rating.label, /强|中|弱/);
});

test("buildWeakBenchmarkCards 在自己已是最强时回退到历史 Top3", () => {
  const myReports = [
    buildReport({ report_date: "2026-03-20", play_count: 2000, comments: 50, shares: 30, favorites: 20 }),
    buildReport({ report_date: "2026-03-19", play_count: 1800, comments: 48, shares: 28, favorites: 18 }),
    buildReport({ report_date: "2026-03-18", play_count: 1600, comments: 44, shares: 26, favorites: 16 }),
  ];

  const cards = buildWeakBenchmarkCards({
    weakestDimensions: ["互动吸引", "增长转化"],
    myAccountId: "self-account",
    myProfileId: "self-user",
    myReports,
    teamReports: [
      ...myReports,
      buildReport({ user_id: "peer-1", account_id: "peer-account-1", comments: 2, shares: 1, favorites: 1, follower_gain: 2 }),
    ],
    accounts: [
      buildAccount(),
      buildAccount({ id: "peer-account-1", profile_id: "peer-1", name: "同题材同学", content_direction: "职场", presentation_format: "口播" }),
    ],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.equal(cards.length, 2);
  assert.equal(cards[0].state, "self_best");
  assert.match(cards[0].headline, /你已是本项最强/);
  assert.equal(cards[0].historyTopSamples.length, 3);
});

test("buildScriptBreakdownData 在无结构化文案时显示原始文案和 AI拆解中", () => {
  const result = buildScriptBreakdownData({
    rawText: "这是原始文案",
    scriptDocument: null,
    scriptSegments: [],
  });

  assert.equal(result.state, "fallback");
  assert.equal(result.rawText, "这是原始文案");
  assert.match(result.placeholder, /AI拆解中/);
});

test("buildAdviceSections 无 AI 数据时生成规则诊断", () => {
  const result = buildAdviceSections({
    aiInsight: null,
    weakestDimension: "增长转化",
    selfValue: 1.8,
    teamValue: 3.4,
  });

  assert.equal(result.source, "rule");
  assert.match(result.diagnosis, /增长转化/);
  assert.match(result.diagnosis, /团队/);
  assert.ok(result.reference.length > 0);
  assert.ok(result.action.length > 0);
});
