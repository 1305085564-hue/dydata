import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { VideoList } from "./video-list";
import type { Profile, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export default async function AdminVideosPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [{ data: videos }, { data: snapshots }, { data: profiles }, { data: accounts }, { data: videoTags }] =
    await Promise.all([
      supabase
        .from("videos")
        .select("*, accounts!inner(name), profiles!inner(name)")
        .order("published_at", { ascending: false }),
      supabase.from("video_metrics_snapshots").select("*"),
      supabase.from("profiles").select("id, name").order("name", { ascending: true }),
      supabase.from("accounts").select("id, name").order("name", { ascending: true }),
      supabase.from("video_tags").select("*"),
    ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:p-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Video Console</p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">视频管理</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
            按账号、负责人、日期和状态查看全部视频与 24h 快照。
          </p>
        </div>
      </section>

      <VideoList
        videos={(videos ?? []) as VideoRow[]}
        snapshots={(snapshots ?? []) as VideoMetricsSnapshot[]}
        profiles={(profiles ?? []) as FilterOption[]}
        accounts={(accounts ?? []) as AccountOption[]}
        videoTags={(videoTags ?? []) as VideoTag[]}
      />
    </div>
  );
}
