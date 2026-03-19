import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { AnalyticsSections } from "./analytics-sections";
import type { AnalyticsSection } from "./analytics-sections";
import { HitAnalyzer } from "./hit-analyzer";
import { PersonnelAnalysis } from "./personnel-analysis";
import { TimeAnalysis } from "./time-analysis";
import { AiInsight } from "./ai-insight";
import { 视频结论卡 } from "./视频结论卡";
import type { AnalyticsVideoRow } from "./视频结论卡-类型";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "owner") redirect("/dashboard");

  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 90);
  const ninetyDaysAgo = ninetyDaysAgoDate.toISOString().split("T")[0];

  const [{ data: reports }, { data: profiles }, { data: videos }, { data: snapshots }, { data: videoTags }] =
    await Promise.all([
      supabase
        .from("daily_reports")
        .select(
          "id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
        )
        .gte("report_date", ninetyDaysAgo)
        .order("report_date", { ascending: false }),
      supabase.from("profiles").select("id, name").order("name"),
      supabase
        .from("videos")
        .select("*, accounts!inner(name), profiles!inner(name)")
        .order("published_at", { ascending: false }),
      supabase.from("video_metrics_snapshots").select("*"),
      supabase.from("video_tags").select("*"),
    ]);

  const submitters = (profiles ?? []).map((p) => p.name);
  const sections: AnalyticsSection[] = [
    {
      title: "爆款分析器",
      content: <HitAnalyzer reports={reports ?? []} submitters={submitters} />,
    },
    {
      title: "人员深度分析",
      content: <PersonnelAnalysis reports={reports ?? []} />,
    },
    {
      title: "时间维度分析",
      content: <TimeAnalysis reports={reports ?? []} />,
    },
    {
      title: "AI 洞察",
      content: <AiInsight />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-2 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">数据分析</h1>
      <视频结论卡
        videos={(videos ?? []) as AnalyticsVideoRow[]}
        snapshots={(snapshots ?? []) as VideoMetricsSnapshot[]}
        videoTags={(videoTags ?? []) as VideoTag[]}
      />
      <AnalyticsSections sections={sections} />
    </div>
  );
}
