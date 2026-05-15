import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
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
  if (!hasPermission(perm.businessRole, perm.permissions, "view_analytics")) redirect("/dashboard");

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
      description="原始视频、24h 快照、标签与异常状态"
      indexItems={[]}
    >
      <section
        id="video-asset-list"
        className="scroll-mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">资产列表</h2>

          <div
            className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
            title="待处理 = 未打标 或 状态异常"
          >
            <Link
              href="/admin/videos?view=pending"
              className={[
                "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              待处理
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#D97757]">
                {pendingCount}
              </span>
            </Link>
            <Link
              href="/admin/videos?view=all"
              className={[
                "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                view === "all"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              全部
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
                {data.summary.totalVideos}
              </span>
            </Link>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
            <span>
              已打标
              <span className="ml-0.5 font-mono tabular-nums text-zinc-700">
                {data.summary.taggedVideos}
              </span>
            </span>
            <span>
              24h 快照
              <span className="ml-0.5 font-mono tabular-nums text-zinc-700">
                {data.summary.snapshotCount}
              </span>
            </span>
            <span>
              异常
              <span className="ml-0.5 font-mono tabular-nums text-[#C9604D]">
                {data.summary.abnormalCount}
              </span>
            </span>
          </div>
        </div>

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
