import { redirect } from "next/navigation";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import {
  buildAnalyticsAccessContext,
  getPresetRange,
  restrictPersonRows,
  type AnalyticsRangePreset,
} from "@/lib/analytics-access";
import { AnalyticsSections } from "@/app/(app)/admin/analytics/analytics-sections";
import type { AnalyticsSection } from "@/app/(app)/admin/analytics/analytics-sections";
import { HitAnalyzer } from "@/app/(app)/admin/analytics/hit-analyzer";
import { PersonnelAnalysis } from "@/app/(app)/admin/analytics/personnel-analysis";
import { TimeAnalysis } from "@/app/(app)/admin/analytics/time-analysis";
import { AiInsight } from "@/app/(app)/admin/analytics/ai-insight";
import { 视频结论卡 } from "@/app/(app)/admin/analytics/视频结论卡";
import type { AnalyticsVideoRow } from "@/app/(app)/admin/analytics/视频结论卡-类型";

interface AnalyticsPageProps {
  searchParams: Promise<{
    preset?: AnalyticsRangePreset;
    from?: string;
    to?: string;
  }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const preset = (params.preset ?? "30d") as AnalyticsRangePreset;
  const range = getPresetRange(preset, new Date(), {
    from: params.from,
    to: params.to,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  const currentUserName = profile?.name ?? user.email ?? "我";
  const isPrivilegedUser = role === "admin" || role === "owner";
  const access = buildAnalyticsAccessContext({
    userId: user.id,
    role,
    teamId: isPrivilegedUser ? "__all__" : null,
    demoTeamId: null,
  });

  // admin/owner 查全团队；member 只查自己
  const teamProfiles: { id: string; name: string }[] = isPrivilegedUser
    ? (await adminSupabase.from("profiles").select("id, name").order("name")).data ?? []
    : [{ id: user.id, name: currentUserName }];

  const teamUserIds = teamProfiles.map((item) => item.id);
  const submitters = isPrivilegedUser
    ? teamProfiles.map((item) => item.name)
    : [currentUserName];

  const [{ data: reports }, { data: videos }, { data: snapshots }, { data: videoTags }] = await Promise.all([
    adminSupabase
      .from("daily_reports")
      .select(
        "id, user_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
      )
      .in("user_id", teamUserIds)
      .gte("report_date", range.from)
      .lte("report_date", range.to)
      .order("report_date", { ascending: false }),
    adminSupabase
      .from("videos")
      .select("*, accounts(name)")
      .in("user_id", teamUserIds)
      .order("published_at", { ascending: false }),
    adminSupabase.from("video_metrics_snapshots").select("*"),
    adminSupabase.from("video_tags").select("*"),
  ]);

  const filteredReports = access.canViewAllMembers
    ? reports ?? []
    : restrictPersonRows(reports ?? [], { role, currentUserName });

  const filteredVideos = (videos ?? []).filter((video) =>
    access.canViewAllMembers ? true : video.user_id === user.id,
  );
  const filteredSnapshots = (snapshots ?? []).filter((snapshot) =>
    filteredVideos.some((video) => video.id === snapshot.video_id),
  );
  const filteredVideoTags = (videoTags ?? []).filter((tag) =>
    filteredVideos.some((video) => video.id === tag.video_id),
  );

  const sections: AnalyticsSection[] = [
    {
      title: "爆款分析器",
      content: <HitAnalyzer reports={filteredReports} submitters={submitters} />,
    },
    {
      title: access.canViewAllMembers ? "人员深度分析" : "我的表现分析",
      content: (
        <PersonnelAnalysis
          reports={filteredReports}
          title={access.canViewAllMembers ? "团队成员表现" : "仅展示我的个人数据"}
        />
      ),
    },
    {
      title: "时间维度分析",
      content: <TimeAnalysis reports={filteredReports} />,
    },
    {
      title: "AI 洞察",
      content: <AiInsight scopeEntityId={user.id} />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-2 sm:px-6 lg:px-8">
      <AnalyticsPageHeader preset={range.preset} from={range.from} to={range.to} />
      <视频结论卡
        videos={filteredVideos as AnalyticsVideoRow[]}
        snapshots={filteredSnapshots as VideoMetricsSnapshot[]}
        videoTags={filteredVideoTags as VideoTag[]}
      />
      <AnalyticsSections sections={sections} />
    </div>
  );
}
