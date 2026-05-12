import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { VideoList } from "./video-list";

type VideoView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

function normalizeView(value: string | undefined): VideoView {
  return value === "all" ? "all" : "pending";
}

export default async function AdminVideosPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!isAdminLevel(perm.role)) redirect("/dashboard");

  const params = await searchParams;
  const view = normalizeView(params.view);

  const supabase = await createClient();
  const data = await loadAdminVideosPageData({ supabase });

  const taggedSet = new Set(data.videoTags.map((tag) => tag.video_id));
  const pendingVideos = data.videos.filter(
    (video) => !taggedSet.has(video.id) || video.anomaly_status !== "正常",
  );
  const visibleVideos = view === "pending" ? pendingVideos : data.videos;
  const pendingCount = pendingVideos.length;

  return (
    <AdminWorkspaceLayout
      eyebrow="Video Assets"
      title="视频资产"
      description="原始视频资产、24h 快照、标签和异常状态；不做内容复盘结论。"
      indexItems={[{ id: "video-asset-list", label: "资产列表", hint: "视频、标签、异常" }]}
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <Link
              href="/admin/videos?view=pending"
              className={[
                "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              待处理
              <span className="ml-1.5 text-[11px] text-[#D97757] font-mono tabular-nums">
                {pendingCount}
              </span>
            </Link>
            <Link
              href="/admin/videos?view=all"
              className={[
                "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                view === "all"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              全部
              <span className="ml-1.5 text-[11px] text-zinc-400 font-mono tabular-nums">
                {data.summary.totalVideos}
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-5 text-[12px] text-zinc-500">
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">已打标</span>
              <span className="font-mono tabular-nums text-zinc-700">{data.summary.taggedVideos}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">24h 快照</span>
              <span className="font-mono tabular-nums text-zinc-700">{data.summary.snapshotCount}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">异常</span>
              <span className="font-mono tabular-nums text-[#C9604D]">{data.summary.abnormalCount}</span>
            </div>
          </div>
        </div>

        {view === "pending" ? (
          <p className="text-[12px] leading-[1.7] text-zinc-500">
            待处理 = 未打标 <span className="text-zinc-400">或</span> 状态异常。
          </p>
        ) : null}
      </section>

      <section id="video-asset-list" className="scroll-mt-8">
        <VideoList
          videos={visibleVideos}
          snapshots={data.snapshots}
          profiles={data.profiles}
          accounts={data.accounts}
          videoTags={data.videoTags}
        />
      </section>
    </AdminWorkspaceLayout>
  );
}
