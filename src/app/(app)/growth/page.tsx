import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calcDimensionScores,
  findBenchmarks,
  type MetricsAccount,
  type MetricsReport,
} from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

const CARD_TITLES = ["状态卡", "诊断", "标杆", "对比", "样本", "AI建议"] as const;

function collectTags(accounts: MetricsAccount[]): string[] {
  return Array.from(
    new Set(
      accounts
        .flatMap((account) => [account.content_direction, account.presentation_format])
        .map((tag) => tag?.trim())
        .filter((tag): tag is string => Boolean(tag)),
    ),
  );
}

export default async function GrowthPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const monthAgoDate = new Date();
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().split("T")[0];

  const [accountsResult, teamReportsResult, profilesResult, allAccountsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_reports")
      .select(
        "user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s",
      )
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, name"),
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format"),
  ]);

  const myAccounts = (accountsResult.data ?? []) as MetricsAccount[];
  const allAccounts = (allAccountsResult.data ?? []) as MetricsAccount[];
  const teamReports = (teamReportsResult.data ?? []) as MetricsReport[];

  const myAccountIds = myAccounts.map((account) => account.id);
  const myReportsResult = myAccountIds.length
    ? await supabase
        .from("daily_reports")
        .select(
          "user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s",
        )
        .in("account_id", myAccountIds)
        .gte("report_date", monthAgo)
    : { data: [] as MetricsReport[] };

  const myReports = (myReportsResult.data ?? []) as MetricsReport[];
  const myTags = collectTags(myAccounts);
  const dimensionScores = calcDimensionScores(myReports, teamReports);
  const benchmarks = findBenchmarks(myReports, myTags, teamReports, allAccounts);
  const profileNameMap = new Map((profilesResult.data ?? []).map((item) => [item.id, item.name]));

  const summary = {
    accountCount: myAccounts.length,
    reportCount: myReports.length,
    teamReportCount: teamReports.length,
    profileName: profile?.name ?? user.email ?? "",
    weakestDimension: Object.entries(dimensionScores).sort((left, right) => left[1].value - right[1].value)[0]?.[0] ?? null,
    sameTagBestName: benchmarks.sameTagBest
      ? profileNameMap.get(benchmarks.sameTagBest.profile_id) ?? benchmarks.sameTagBest.name
      : null,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">成长分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.profileName} · {summary.accountCount} 个账号 · 近30天 {summary.reportCount} 条个人样本
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARD_TITLES.map((title) => (
          <Card key={title} className="card-elevated min-h-44">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {title === "状态卡" && (
                <>
                  <p>标签：{myTags.length > 0 ? myTags.join("、") : "暂无标签"}</p>
                  <p>团队样本：{summary.teamReportCount} 条</p>
                </>
              )}
              {title === "诊断" && (
                <>
                  <p>最弱维度：{summary.weakestDimension ?? "暂无"}</p>
                  <p>维度分数已完成服务端计算。</p>
                </>
              )}
              {title === "标杆" && (
                <>
                  <p>同标签标杆：{summary.sameTagBestName ?? "暂无"}</p>
                  <p>标杆对象允许为空，便于后续 UI 接入。</p>
                </>
              )}
              {title === "对比" && <p>个人与团队分位数据已准备完成。</p>}
              {title === "样本" && <p>账号、团队、近30天日报数据已完成组装。</p>}
              {title === "AI建议" && <p>当前仅保留占位，后续可直接消费已计算结果。</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
