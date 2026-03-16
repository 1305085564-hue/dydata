import test from "node:test";
import assert from "node:assert/strict";

import {
  calcInteractionScore,
  findBenchmarks,
  type MetricsAccount,
  type MetricsReport,
} from "./metrics.ts";

function buildReport(overrides: Partial<MetricsReport>): MetricsReport {
  return {
    user_id: "self-profile",
    account_id: "self-account",
    report_date: "2026-03-17",
    play_count: 100,
    likes: 10,
    comments: 5,
    shares: 2,
    favorites: 1,
    follower_gain: 1,
    completion_rate: "20",
    completion_rate_5s: "30",
    ...overrides,
  };
}

function buildAccount(overrides: Partial<MetricsAccount>): MetricsAccount {
  return {
    id: "account-1",
    profile_id: "profile-1",
    name: "账号1",
    content_direction: null,
    presentation_format: null,
    ...overrides,
  };
}

test("互动质量分按既定权重计算", () => {
  const score = calcInteractionScore(100, 20, 10, 5);

  assert.equal(score, 35.25);
});

test("互动质量分会保留两位小数避免浮点误差", () => {
  const score = calcInteractionScore(11, 7, 3, 2);

  assert.equal(score, 6.25);
});

test("findBenchmarks 返回同标签、最弱维度、近7天涨势三个标杆", () => {
  const selfReports = [
    buildReport({ report_date: "2026-03-17", play_count: 100, likes: 1, comments: 1, shares: 1 }),
    buildReport({ report_date: "2026-03-16", play_count: 100, likes: 1, comments: 1, shares: 1 }),
  ];

  const teamReports = [
    ...selfReports,
    buildReport({
      user_id: "same-tag-profile",
      account_id: "same-tag-account",
      report_date: "2026-03-17",
      play_count: 800,
      likes: 80,
      comments: 16,
      shares: 8,
      favorites: 8,
      follower_gain: 8,
    }),
    buildReport({
      user_id: "same-tag-profile",
      account_id: "same-tag-account",
      report_date: "2026-03-16",
      play_count: 600,
      likes: 60,
      comments: 12,
      shares: 6,
      favorites: 6,
      follower_gain: 6,
    }),
    buildReport({
      user_id: "weak-profile",
      account_id: "weak-account",
      report_date: "2026-03-17",
      play_count: 100,
      likes: 2,
      comments: 20,
      shares: 2,
      favorites: 2,
      follower_gain: 2,
    }),
    buildReport({
      user_id: "weak-profile",
      account_id: "weak-account",
      report_date: "2026-03-16",
      play_count: 100,
      likes: 2,
      comments: 24,
      shares: 2,
      favorites: 2,
      follower_gain: 2,
    }),
    buildReport({
      user_id: "riser-profile",
      account_id: "riser-account",
      report_date: "2026-03-17",
      play_count: 600,
    }),
    buildReport({
      user_id: "riser-profile",
      account_id: "riser-account",
      report_date: "2026-03-15",
      play_count: 500,
    }),
    buildReport({
      user_id: "riser-profile",
      account_id: "riser-account",
      report_date: "2026-03-10",
      play_count: 100,
    }),
    buildReport({
      user_id: "riser-profile",
      account_id: "riser-account",
      report_date: "2026-03-08",
      play_count: 100,
    }),
  ];

  const accounts = [
    buildAccount({
      id: "self-account",
      profile_id: "self-profile",
      name: "自己",
      content_direction: "美妆",
      presentation_format: "口播",
    }),
    buildAccount({
      id: "same-tag-account",
      profile_id: "same-tag-profile",
      name: "同标签标杆",
      content_direction: "美妆",
      presentation_format: "混剪",
    }),
    buildAccount({
      id: "weak-account",
      profile_id: "weak-profile",
      name: "弱项标杆",
      content_direction: "知识",
      presentation_format: "口播",
    }),
    buildAccount({
      id: "riser-account",
      profile_id: "riser-profile",
      name: "涨势标杆",
      content_direction: "剧情",
      presentation_format: "实拍",
    }),
  ];

  const result = findBenchmarks(selfReports, ["美妆", "口播"], teamReports, accounts);

  assert.equal(result.sameTagBest?.accountId, "same-tag-account");
  assert.equal(result.sameTagBest?.profileId, "same-tag-profile");
  assert.equal(result.sameTagBest?.reason, "同内容标签账号里，近30天平均播放最高");
  assert.equal(result.weakestDimBest?.accountId, "weak-account");
  assert.equal(result.weakestDimBest?.profileId, "weak-profile");
  assert.equal(result.weakestDimBest?.reason, "你的最弱维度是 commentRate，该账号在该维度团队最强");
  assert.equal(result.recentRiser?.accountId, "riser-account");
  assert.equal(result.recentRiser?.profileId, "riser-profile");
  assert.equal(result.recentRiser?.reason, "近7天较前7天平均播放增幅最高");
});

test("findBenchmarks 在无候选时返回 null 并跳过缺少前7天数据的账号", () => {
  const selfReports = [buildReport({ report_date: "2026-03-17" })];
  const teamReports = [
    ...selfReports,
    buildReport({
      user_id: "only-recent-profile",
      account_id: "only-recent-account",
      report_date: "2026-03-17",
      play_count: 500,
    }),
  ];
  const accounts = [
    buildAccount({ id: "self-account", profile_id: "self-profile", name: "自己" }),
    buildAccount({
      id: "only-recent-account",
      profile_id: "only-recent-profile",
      name: "只有近7天",
      content_direction: "其他",
      presentation_format: "其他",
    }),
  ];

  const result = findBenchmarks(selfReports, [], teamReports, accounts);

  assert.equal(result.sameTagBest, null);
  assert.equal(result.weakestDimBest?.accountId, "only-recent-account");
  assert.equal(result.weakestDimBest?.profileId, "only-recent-profile");
  assert.match(
    result.weakestDimBest?.reason ?? "",
    /^你的最弱维度是 .+，该账号在该维度团队最强$/,
  );
  assert.equal(result.recentRiser, null);
});
