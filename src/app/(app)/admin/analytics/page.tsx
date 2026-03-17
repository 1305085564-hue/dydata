import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsSections } from "./analytics-sections";
import type { AnalyticsSection } from "./analytics-sections";
import { HitAnalyzer } from "./hit-analyzer";
import { PersonnelAnalysis } from "./personnel-analysis";
import { TimeAnalysis } from "./time-analysis";
import { AiInsight } from "./ai-insight";

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
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at")
    .gte("report_date", ninetyDaysAgo)
    .order("report_date", { ascending: false });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .order("name");

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
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">数据分析</h1>
      <AnalyticsSections sections={sections} />
    </div>
  );
}
