import { redirect } from "next/navigation";

import {
  calcDimensionScores,
  calcInteractionScore,
  calcRates,
  findBenchmarks,
  parsePercentText,
  type BenchmarkMatch,
  type MetricsAccount,
  type MetricsReport,
} from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { GrowthClientShell } from "./growth-client";

function collectTags(accounts: MetricsAccount[]): string[] {
  return Array.from(
    new Set(
      accounts
        .flatMap((a) => [a.content_direction, a.presentation_format])
        .map((t) => t?.trim())
        .filter((t): t is string => Boolean(t)),
    ),
  );
}

function safeDiv(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

function buildStatusCards(myReports: MetricsReport[], prevReports: MetricsReport[]) {
  const totalPlay = myReports.reduce((s, r) => s + (r.play_count ?? 0), 0);
  const totalFollower = myReports.reduce((s, r) => s + (r.follower_gain ?? 0), 0);
  const avgLikeRate = myReports.length > 0
    ? myReports.reduce((s, r) => s + calcRates(r).likeRate, 0) / myReports.length
    : 0;
  const avgCompletionRate = myReports.length > 0
    ? myReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / myReports.length
    : 0;

  const prevTotalPlay = prevReports.reduce((s, r) => s + (r.play_count ?? 0), 0);
  const prevTotalFollower = prevReports.reduce((s, r) => s + (r.follower_gain ?? 0), 0);
  const prevAvgLikeRate = prevReports.length > 0
    ? prevReports.reduce((s, r) => s + calcRates(r).likeRate, 0) / prevReports.length
    : 0;
  const prevAvgCompletionRate = prevReports.length > 0
    ? prevReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / prevReports.length
    : 0;

  return [
    { label: "发布数", value: String(myReports.length), prev: prevReports.length },
    { label: "总播放", value: (totalPlay / 10000).toFixed(1) + "万", delta: safeDiv(totalPlay - prevTotalPlay, prevTotalPlay || 1) * 100 },
    { label: "总涨粉", value: String(totalFollower), delta: safeDiv(totalFollower - prevTotalFollower, prevTotalFollower || 1) * 100 },
    { label: "平均点赞率", value: pct(avgLikeRate), delta: avgLikeRate - prevAvgLikeRate },
    { label: "平均完播率", value: pct(avgCompletionRate), delta: avgCompletionRate - prevAvgCompletionRate },
  ];
}

function buildDiagnosisProps(dimensionScores: ReturnType<typeof calcDimensionScores>) {
  const dims = [
    { key: "likeRate", name: "互动吸引" },
    { key: "commentRate", name: "评论互动" },
    { key: "completionRate", name: "内容留存" },
    { key: "followerRate", name: "增长转化" },
    { key: "completionRate5s", name: "开头留人" },
  ] as const;

  const scored = dims.map((d) => {
    const s = dimensionScores[d.key];
    const teamVal = s.team || 1;
    const ratio = s.self / teamVal;
    const percentile = Math.min(100, Math.max(0, ratio * 50));
    return { 维度名: d.name, 分位值: Math.round(percentile), key: d.key, diff: s.value };
  });

  const sorted = [...scored].sort((a, b) => b.分位值 - a.分位值);
  const strong = sorted.slice(0, 3).map((s) => s.维度名);
  const weak = sorted.slice(-2).map((s) => ({ 名称: s.维度名 }));

  return {
    五维评分数据: scored.slice(0, 5).map((s) => ({ 维度名: s.维度名, 分位值: s.分位值 })) as [any, any, any, any, any],
    强项: strong as [string, string, string],
    弱项: weak as [any, any],
  };
}

function buildBenchmarkCards(
  benchmarks: ReturnType<typeof findBenchmarks>,
  profileNameMap: Map<string, string>,
  myReports: MetricsReport[],
  teamReports: MetricsReport[],
) {
  const cards: Array<{
    标杆类型: "同标签最佳" | "单项最佳" | "近期跃迁";
    账号名: string;
    标签: string[];
    推荐理由: string;
    核心指标差距: any;
    代表样本入口: { 标题: string; 链接: string };
  }> = [];

  const myAvgRates = myReports.length > 0
    ? {
        likeRate: myReports.reduce((s, r) => s + calcRates(r).likeRate, 0) / myReports.length,
        completionRate: myReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / myReports.length,
        followerRate: myReports.reduce((s, r) => s + calcRates(r).followerRate, 0) / myReports.length,
      }
    : { likeRate: 0, completionRate: 0, followerRate: 0 };

  function makeDiffItems(match: BenchmarkMatch) {
    const benchReports = teamReports.filter((r) => r.account_id === match.accountId);
    const benchAvg = benchReports.length > 0
      ? {
          likeRate: benchReports.reduce((s, r) => s + calcRates(r).likeRate, 0) / benchReports.length,
          completionRate: benchReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / benchReports.length,
          followerRate: benchReports.reduce((s, r) => s + calcRates(r).followerRate, 0) / benchReports.length,
        }
      : { likeRate: 0, completionRate: 0, followerRate: 0 };

    return [
      { 指标名: "点赞率", 我的值: Number(myAvgRates.likeRate.toFixed(2)), 标杆值: Number(benchAvg.likeRate.toFixed(2)), 单位: "%" },
      { 指标名: "完播率", 我的值: Number(myAvgRates.completionRate.toFixed(1)), 标杆值: Number(benchAvg.completionRate.toFixed(1)), 单位: "%" },
      { 指标名: "涨粉率", 我的值: Number(myAvgRates.followerRate.toFixed(2)), 标杆值: Number(benchAvg.followerRate.toFixed(2)), 单位: "%" },
    ];
  }

  const typeMap: Array<[keyof typeof benchmarks, "同标签最佳" | "单项最佳" | "近期跃迁"]> = [
    ["sameTagBest", "同标签最佳"],
    ["weakestDimBest", "单项最佳"],
    ["recentRiser", "近期跃迁"],
  ];

  for (const [key, type] of typeMap) {
    const match = benchmarks[key];
    if (!match) continue;
    const ownerName = profileNameMap.get(match.profileId) ?? "";
    cards.push({
      标杆类型: type,
      账号名: ownerName || match.name || match.accountId.slice(0, 8),
      标签: [],
      推荐理由: match.reason,
      核心指标差距: makeDiffItems(match),
      代表样本入口: { 标题: "查看 TA 的作品", 链接: "#" },
    });
  }

  return cards;
}

function buildPKData(
  myReports: MetricsReport[],
  benchmarks: ReturnType<typeof findBenchmarks>,
  profileNameMap: Map<string, string>,
  teamReports: MetricsReport[],
  profileName: string,
) {
  const myAvg = myReports.length > 0
    ? {
        play_count: myReports.reduce((s, r) => s + (r.play_count ?? 0), 0) / myReports.length,
        likes: myReports.reduce((s, r) => s + (r.likes ?? 0), 0) / myReports.length,
        comments: myReports.reduce((s, r) => s + (r.comments ?? 0), 0) / myReports.length,
        shares: myReports.reduce((s, r) => s + (r.shares ?? 0), 0) / myReports.length,
        favorites: myReports.reduce((s, r) => s + (r.favorites ?? 0), 0) / myReports.length,
        follower_gain: myReports.reduce((s, r) => s + (r.follower_gain ?? 0), 0) / myReports.length,
        completion_rate: String(myReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / myReports.length),
        completion_rate_5s: String(myReports.reduce((s, r) => s + parsePercentText(r.completion_rate_5s), 0) / myReports.length),
      }
    : null;

  const opponent = benchmarks.sameTagBest ?? benchmarks.weakestDimBest ?? benchmarks.recentRiser;
  if (!myAvg || !opponent) return null;

  const oppReports = teamReports.filter((r) => r.account_id === opponent.accountId);
  const oppAvg = oppReports.length > 0
    ? {
        play_count: oppReports.reduce((s, r) => s + (r.play_count ?? 0), 0) / oppReports.length,
        likes: oppReports.reduce((s, r) => s + (r.likes ?? 0), 0) / oppReports.length,
        comments: oppReports.reduce((s, r) => s + (r.comments ?? 0), 0) / oppReports.length,
        shares: oppReports.reduce((s, r) => s + (r.shares ?? 0), 0) / oppReports.length,
        favorites: oppReports.reduce((s, r) => s + (r.favorites ?? 0), 0) / oppReports.length,
        follower_gain: oppReports.reduce((s, r) => s + (r.follower_gain ?? 0), 0) / oppReports.length,
        completion_rate: String(oppReports.reduce((s, r) => s + parsePercentText(r.completion_rate), 0) / oppReports.length),
        completion_rate_5s: String(oppReports.reduce((s, r) => s + parsePercentText(r.completion_rate_5s), 0) / oppReports.length),
      }
    : null;

  if (!oppAvg) return null;

  const oppName = profileNameMap.get(opponent.profileId) ?? opponent.name ?? "标杆";

  return {
    playerA: { id: "self", name: profileName, ...myAvg },
    playerB: { id: opponent.accountId, name: oppName, ...oppAvg },
  };
}

function buildSampleList(
  benchmarks: ReturnType<typeof findBenchmarks>,
  teamReports: MetricsReport[],
  profileNameMap: Map<string, string>,
  allAccounts: MetricsAccount[],
) {
  const targetIds = [benchmarks.sameTagBest, benchmarks.weakestDimBest, benchmarks.recentRiser]
    .filter((b): b is BenchmarkMatch => b !== null)
    .map((b) => b.accountId);

  if (targetIds.length === 0) return [];

  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  const samples = teamReports
    .filter((r) => targetIds.includes(r.account_id))
    .sort((a, b) => b.report_date.localeCompare(a.report_date))
    .slice(0, 6)
    .map((r) => {
      const account = accountMap.get(r.account_id);
      const ownerName = profileNameMap.get(r.user_id) ?? "";
      const rates = calcRates(r);
      return {
        id: `${r.account_id}-${r.report_date}`,
        视频标题: `${ownerName} ${r.report_date} 作品`,
        发布时间: r.report_date,
        账号名: account?.name ?? ownerName,
        标签: [account?.content_direction, account?.presentation_format].filter((t): t is string => Boolean(t)),
        播放量: ((r.play_count ?? 0) / 10000).toFixed(1) + "万",
        点赞率: rates.likeRate.toFixed(2) + "%",
        完播率: parsePercentText(r.completion_rate).toFixed(1) + "%",
        涨粉率: rates.followerRate.toFixed(2) + "%",
        文案: "",
        推荐理由: "该作品在关键指标上表现突出",
        来源: "标杆样本" as const,
      };
    });

  return samples;
}

export default async function GrowthPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const now = new Date();
  const monthAgoDate = new Date(now);
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().split("T")[0];

  const weekAgoDate = new Date(now);
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const weekAgo = weekAgoDate.toISOString().split("T")[0];

  const twoWeeksAgoDate = new Date(now);
  twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
  const twoWeeksAgo = twoWeeksAgoDate.toISOString().split("T")[0];

  const [accountsResult, teamReportsResult, profilesResult, allAccountsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_reports")
      .select("user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s")
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, name"),
    supabase.from("accounts").select("id, profile_id, name, content_direction, presentation_format"),
  ]);

  const myAccounts = (accountsResult.data ?? []) as MetricsAccount[];
  const allAccounts = (allAccountsResult.data ?? []) as MetricsAccount[];
  const teamReports = (teamReportsResult.data ?? []) as MetricsReport[];
  const profileNameMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p.name]));

  const myAccountIds = myAccounts.map((a) => a.id);
  const myAllReports = teamReports.filter((r) => myAccountIds.includes(r.account_id));
  const myReports7d = myAllReports.filter((r) => r.report_date >= weekAgo);
  const myReportsPrev7d = myAllReports.filter((r) => r.report_date >= twoWeeksAgo && r.report_date < weekAgo);

  const myTags = collectTags(myAccounts);
  const dimensionScores = calcDimensionScores(myAllReports, teamReports);
  const benchmarks = findBenchmarks(myAllReports, myTags, teamReports, allAccounts);

  const profileName = profile?.name ?? user.email ?? "";
  const statusCards = buildStatusCards(myReports7d, myReportsPrev7d);
  const diagnosisProps = buildDiagnosisProps(dimensionScores);
  const benchmarkCards = buildBenchmarkCards(benchmarks, profileNameMap, myAllReports, teamReports);
  const pkData = buildPKData(myAllReports, benchmarks, profileNameMap, teamReports, profileName);
  const sampleList = buildSampleList(benchmarks, teamReports, profileNameMap, allAccounts);

  return (
    <GrowthClientShell
      profileName={profileName}
      accountCount={myAccounts.length}
      reportCount={myAllReports.length}
      statusCards={statusCards}
      diagnosisProps={diagnosisProps}
      benchmarkCards={benchmarkCards}
      pkData={pkData}
      sampleList={sampleList}
      userId={user.id}
      accountId={myAccountIds[0] ?? ""}
    />
  );
}
