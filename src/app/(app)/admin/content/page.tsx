import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { ContentList } from "./content-list";
import type { Profile, Video, VideoMetricsSnapshot } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export default async function AdminContentPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: videosRaw },
    { data: snapshots },
    { data: profiles },
    { data: accounts },
    { data: reviewedResults },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select("*, accounts!inner(name), profiles!inner(name)"),
    supabase
      .from("video_metrics_snapshots")
      .select("video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares")
      .eq("snapshot_type", "24h")
      .order("captured_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name").order("name", { ascending: true }),
    serviceClient
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success"),
  ]);

  const videos = ((videosRaw ?? []) as VideoRow[]).sort((a, b) => {
    const aTs = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime();
    const bTs = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime();
    return bTs - aTs;
  });

  // 已复盘 video_id 集合
  const reviewedVideoIds = new Set<string>(
    (reviewedResults ?? [])
      .map((r) => {
        const j = r.result_json as Record<string, unknown> | null;
        return typeof j?.video_id === "string" ? j.video_id : null;
      })
      .filter((id): id is string => id !== null)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">内容管理</h1>
        <p className="text-sm text-muted-foreground">
          次日复盘工作台：把昨日文案和今日结果数据放在一起，快速定位问题、输出整改建议。
        </p>
      </div>

      <ContentList
        videos={videos}
        snapshots={(snapshots ?? []) as VideoMetricsSnapshot[]}
        profiles={(profiles ?? []) as FilterOption[]}
        accounts={(accounts ?? []) as AccountOption[]}
        reviewedVideoIds={Array.from(reviewedVideoIds)}
      />
    </div>
  );
}
