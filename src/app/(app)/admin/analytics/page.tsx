import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // 近 90 天全部 daily_reports
  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 90);
  const ninetyDaysAgo = ninetyDaysAgoDate.toISOString().split("T")[0];
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at")
    .gte("report_date", ninetyDaysAgo)
    .order("report_date", { ascending: false });

  // 提交人列表
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .order("name");

  const submitters = (profiles ?? []).map((p) => p.name);

  return (
        <div className="mx-auto max-w-5xl space-y-8">
          <h1 className="text-2xl font-semibold">数据分析</h1>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>爆款分析器</CardTitle>
            </CardHeader>
            <CardContent>
              <HitAnalyzer reports={reports ?? []} submitters={submitters} />
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>人员深度分析</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonnelAnalysis reports={reports ?? []} />
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>时间维度分析</CardTitle>
            </CardHeader>
            <CardContent>
              <TimeAnalysis reports={reports ?? []} />
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>AI 洞察</CardTitle>
            </CardHeader>
            <CardContent>
              <AiInsight />
            </CardContent>
          </Card>
        </div>
  );
}
