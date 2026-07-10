import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdviceSections,
  buildGrowthDataContract,
  buildGrowthDimensionCards,
  buildScriptBreakdownData,
  buildWeakBenchmarkCards,
  getGrowthCredibility,
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
  submitter?: string;
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

test("getGrowthCredibility 在 3 条和 10 条边界返回唯一分级", () => {
  assert.deepEqual(getGrowthCredibility(0), {
    level: "low",
    label: "样本不足，仅供参考",
    sampleCount: 0,
  });
  assert.equal(getGrowthCredibility(2).level, "low");
  assert.equal(getGrowthCredibility(3).level, "mid");
  assert.equal(getGrowthCredibility(9).level, "mid");
  assert.equal(getGrowthCredibility(10).level, "high");
});

test("buildGrowthDataContract 只用能力六维识别最弱项并生成规则结论", () => {
  const myReports = [
    buildReport({
      completion_rate_5s: "20",
      completion_rate: "18",
      follower_gain: 12,
      content: "我的真实文案",
    }),
  ];
  const teamReports = [
    buildReport({
      user_id: "peer-1",
      account_id: "peer-account-1",
      submitter: "小王",
      completion_rate_5s: "50",
      completion_rate: "35",
      follower_gain: 14,
      content: "普通对标文案",
    }),
    buildReport({
      user_id: "peer-2",
      account_id: "peer-account-2",
      submitter: "小李",
      completion_rate_5s: "70",
      completion_rate: "45",
      follower_gain: 16,
      content: "高表现对标文案",
    }),
  ];

  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports,
    teamReports,
    scriptSegments: [],
    scriptSegmentsByAccountId: new Map([
      ["peer-account-2", [{ content: "开头直接抛出亏损结果" }]],
    ]),
  });

  assert.equal(contract.emptyState.isEmpty, false);
  assert.equal(contract.radar.length, 6);
  assert.deepEqual(
    contract.radar.map((item) => item.dimension),
    ["开头留人", "中段跳出", "整体完播", "增长转化", "互动吸引", "话题爆点"],
  );
  assert.equal(contract.verdict?.weakestDimension, "开头留人");
  assert.equal(contract.verdict?.source, "rule");
  assert.equal(contract.verdict?.metric.self, 20);
  assert.equal(contract.verdict?.metric.teamAvg, 60);
  assert.match(contract.verdict?.diagnosis ?? "", /20\.0%/);
  assert.match(contract.verdict?.diagnosis ?? "", /60\.0%/);
  assert.match(contract.verdict?.prescription ?? "", /开头 3 秒/);
});

test("buildGrowthDataContract 中段跳出按越低越好评级", () => {
  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [buildReport({ completion_rate_5s: "50", completion_rate: "45" })],
    teamReports: [
      buildReport({
        user_id: "peer-1",
        account_id: "peer-account-1",
        submitter: "小王",
        completion_rate_5s: "60",
        completion_rate: "35",
      }),
    ],
    scriptSegments: [],
    scriptSegmentsByAccountId: new Map(),
  });

  const midBounce = contract.radar.find((item) => item.dimension === "中段跳出");
  assert.equal(midBounce?.self, 5);
  assert.equal(midBounce?.teamAvg, 25);
  assert.equal(midBounce?.rating, "strong");
});

test("buildGrowthDataContract 对标只返回展示需要的三个同事字段", () => {
  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [buildReport({ completion_rate_5s: "20", completion_rate: "18" })],
    teamReports: [
      buildReport({
        user_id: "secret-user-id",
        account_id: "secret-account-id",
        submitter: "小李",
        completion_rate_5s: "70",
        completion_rate: "45",
        content: "日报里的真实文案片段",
      }),
    ],
    scriptSegments: [],
    scriptSegmentsByAccountId: new Map([
      ["secret-account-id", [{ content: "结构化脚本里的真实片段" }]],
    ]),
  });

  assert.equal(contract.benchmark.state, "ok");
  assert.deepEqual(Object.keys(contract.benchmark.peer ?? {}).sort(), ["dimensionValue", "name", "scriptSnippet"]);
  assert.deepEqual(contract.benchmark.peer, {
    name: "小李",
    dimensionValue: 70,
    scriptSnippet: "结构化脚本里的真实片段",
  });
  assert.equal(JSON.stringify(contract.benchmark).includes("secret-user-id"), false);
  assert.equal(JSON.stringify(contract.benchmark).includes("secret-account-id"), false);
});

test("buildGrowthDataContract 零数据和无脚本返回明确空状态", () => {
  const empty = buildGrowthDataContract({
    profileName: "新同事",
    accountCount: 0,
    myProfileId: "new-user",
    myReports: [],
    teamReports: [],
    scriptSegments: [],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.deepEqual(empty.identity, { profileName: "新同事", accountCount: 0, reportCount: 0 });
  assert.deepEqual(empty.emptyState, { isEmpty: true, reason: "还没有真实日报数据" });
  assert.equal(empty.verdict, null);
  assert.deepEqual(empty.radar, []);
  assert.deepEqual(empty.metricsOverview, []);
  assert.equal(empty.benchmark.state, "none");
  assert.deepEqual(empty.scriptBreakdown, { state: "none" });
  assert.deepEqual(empty.trend, []);
});

test("buildGrowthDataContract 有结构化脚本时按顺序返回，缺实名对标时只回团队均值", () => {
  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [buildReport({ completion_rate_5s: "20", completion_rate: "18" })],
    teamReports: [
      buildReport({
        user_id: "peer-without-name",
        account_id: "peer-account",
        submitter: "",
        completion_rate_5s: "60",
        completion_rate: "40",
      }),
    ],
    scriptSegments: [
      { id: "seg-1", segmentType: "hook", content: "先说结果" },
      { id: "seg-2", segmentType: "core_point", content: "再给方法" },
    ],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.equal(contract.benchmark.state, "fallback_team_avg");
  assert.equal(typeof contract.benchmark.teamAvg, "number");
  assert.deepEqual(contract.scriptBreakdown, {
    state: "ok",
    segments: [
      { type: "hook", order: 1, content: "先说结果" },
      { type: "core_point", order: 2, content: "再给方法" },
    ],
  });
});
