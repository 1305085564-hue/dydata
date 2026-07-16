import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdviceSections,
  buildGrowthDataContract,
  buildGrowthDimensionCards,
  buildScriptBreakdownData,
  buildWeakBenchmarkCards,
  getGrowthCredibility,
  resolveGrowthPhase,
  resolveGrowthStage,
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
    scriptSegmentsByAccountId: new Map(),
  });

  assert.deepEqual(empty.identity, { profileName: "新同事", accountCount: 0, reportCount: 0 });
  assert.deepEqual(empty.emptyState, { isEmpty: true, reason: "还没有真实日报数据" });
  assert.equal(empty.verdict, null);
  assert.deepEqual(empty.radar, []);
  assert.deepEqual(empty.metricsOverview, []);
  assert.equal(empty.benchmark.state, "none");
  assert.equal(empty.ownScriptSnippet, null);
  assert.deepEqual(empty.trend, []);
});

test("buildGrowthDataContract 提取最近一篇文案开头作为对照片段，缺实名对标时只回团队均值", () => {
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
    scriptSegmentsByAccountId: new Map(),
  });

  assert.equal(contract.benchmark.state, "fallback_team_avg");
  assert.equal(typeof contract.benchmark.teamAvg, "number");
  assert.deepEqual(contract.ownScriptSnippet, { reportDate: "2026-03-20", snippet: "原始文案" });
});

test("buildGrowthDataContract 对照片段只取开头一段，跳过空白文案，长开头截断", () => {
  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [
      buildReport({ report_date: "2026-03-18", content: "第一段抛结果\n第二段讲背景" }),
      buildReport({ report_date: "2026-03-19", content: "   " }),
      buildReport({ report_date: "2026-03-20", content: "长".repeat(100) }),
    ],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.deepEqual(contract.ownScriptSnippet, { reportDate: "2026-03-20", snippet: `${"长".repeat(80)}…` });

  const fallbackToEarlier = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [
      buildReport({ report_date: "2026-03-18", content: "第一段抛结果\n第二段讲背景" }),
      buildReport({ report_date: "2026-03-19", content: "   " }),
    ],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.deepEqual(fallbackToEarlier.ownScriptSnippet, { reportDate: "2026-03-18", snippet: "第一段抛结果" });

  const noContentAtAll = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [buildReport({ content: null })],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
  });

  assert.equal(noContentAtAll.ownScriptSnippet, null);
});


test("resolveGrowthPhase 按全历史份数和团队人数划分三态", () => {
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 0, teamActiveCount: 8 }), "accumulation");
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 9, teamActiveCount: 8 }), "accumulation");
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 10, teamActiveCount: 8 }), "observation");
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 30, teamActiveCount: 8 }), "observation");
  // >30 份但团队不足 5 人时不升成熟期
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 31, teamActiveCount: 4 }), "observation");
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 31, teamActiveCount: 5 }), "mature");
  assert.equal(resolveGrowthPhase({ lifetimeReportCount: 60, teamActiveCount: 12 }), "mature");
});

test("resolveGrowthStage 断流超过 3 天只标记 isStale 不改变期", () => {
  const windowReports = Array.from({ length: 12 }, (_, index) =>
    buildReport({ report_date: `2026-07-${String(index + 1).padStart(2, "0")}` }),
  );
  const stage = resolveGrowthStage({
    windowReports,
    context: {
      now: new Date("2026-07-16T08:00:00+08:00"),
      lifetimeReportCount: 12,
      lastReportDate: "2026-07-12",
      teamActiveCount: 6,
    },
  });

  assert.equal(stage.phase, "observation");
  assert.equal(stage.daysSinceLastReport, 4);
  assert.equal(stage.isStale, true);
  assert.equal(stage.windowReportCount, 12);

  const notStale = resolveGrowthStage({
    windowReports,
    context: {
      now: new Date("2026-07-16T08:00:00+08:00"),
      lifetimeReportCount: 12,
      lastReportDate: "2026-07-13",
      teamActiveCount: 6,
    },
  });
  assert.equal(notStale.daysSinceLastReport, 3);
  assert.equal(notStale.isStale, false);
});

test("resolveGrowthStage 缺省上下文时退化为窗口口径，且全历史份数不小于窗口份数", () => {
  const windowReports = [buildReport({ report_date: "2026-07-10" }), buildReport({ report_date: "2026-07-12" })];
  const fallback = resolveGrowthStage({ windowReports });
  assert.equal(fallback.lifetimeReportCount, 2);
  assert.equal(fallback.lastReportDate, "2026-07-12");
  assert.equal(fallback.phase, "accumulation");

  const guarded = resolveGrowthStage({
    windowReports,
    context: { lifetimeReportCount: 1, lastReportDate: undefined },
  });
  assert.equal(guarded.lifetimeReportCount, 2);
  // 上下文缺省时回退到窗口内最近日期
  assert.equal(guarded.lastReportDate, "2026-07-12");
});

test("buildGrowthDataContract 重度断流（窗口空但全历史有数据）不误报新人空态", () => {
  const frozen = buildGrowthDataContract({
    profileName: "老成员",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
    growthContext: { lifetimeReportCount: 20, lastReportDate: "2026-06-01", teamActiveCount: 6, now: new Date("2026-07-16T08:00:00+08:00") },
  });

  assert.equal(frozen.emptyState.isEmpty, false);
  assert.equal(frozen.stage.phase, "observation");
  assert.equal(frozen.stage.isStale, true);
  assert.equal(frozen.stage.windowReportCount, 0);
  assert.equal(frozen.verdict, null);

  const newcomer = buildGrowthDataContract({
    profileName: "新同事",
    accountCount: 0,
    myProfileId: "new-user",
    myReports: [],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
    growthContext: { lifetimeReportCount: 0, lastReportDate: null, teamActiveCount: 6 },
  });
  assert.equal(newcomer.emptyState.isEmpty, true);
  assert.equal(newcomer.stage.phase, "accumulation");
});

test("buildGrowthDataContract 正常数据时 stage 随上下文进入契约", () => {
  const contract = buildGrowthDataContract({
    profileName: "阿禅",
    accountCount: 1,
    myProfileId: "self-user",
    myReports: [buildReport({ completion_rate_5s: "20", completion_rate: "18" })],
    teamReports: [],
    scriptSegmentsByAccountId: new Map(),
    growthContext: { lifetimeReportCount: 5, lastReportDate: "2026-07-01", teamActiveCount: 2, now: new Date("2026-07-16T08:00:00+08:00") },
  });

  assert.equal(contract.stage.phase, "accumulation");
  assert.equal(contract.stage.lifetimeReportCount, 5);
  assert.equal(contract.stage.daysSinceLastReport, 15);
  assert.equal(contract.stage.isStale, true);
  assert.equal(contract.stage.teamActiveCount, 2);
});
