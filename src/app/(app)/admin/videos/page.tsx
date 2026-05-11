import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { VideoList } from "./video-list";

export default async function AdminVideosPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminVideosPageData({ supabase });

  const metrics = [
    { label: "视频总量", value: data.summary.totalVideos, hint: "当前已录入视频" },
    { label: "已打标签", value: data.summary.taggedVideos, hint: "已有标签结果" },
    { label: "24h 快照", value: data.summary.snapshotCount, hint: "已生成的快照数" },
    { label: "异常视频", value: data.summary.abnormalCount, hint: "需要优先排查" },
  ];

  return (
    <AdminWorkspaceLayout
      eyebrow="Video Assets"
      title="视频资产"
      description="管理原始视频资产、24h 快照、标签和异常状态；这里不做内容复盘结论。"
      indexItems={[
        { id: "video-asset-metrics", label: "资产总览", hint: "数量、快照、异常" },
        { id: "video-asset-list", label: "资产列表", hint: "视频、标签、异常" },
      ]}
    >

      <div id="video-asset-metrics" className="scroll-mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">{m.label}</p>
            <p className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800 font-mono tabular-nums">{m.value}</p>
            <p className="mt-2 text-[12px] leading-[1.7] text-zinc-400">{m.hint}</p>
          </div>
        ))}
      </div>

      <section id="video-asset-list" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">资产列表</h2>
        <div className="mt-4">
          <VideoList
            videos={data.videos}
            snapshots={data.snapshots}
            profiles={data.profiles}
            accounts={data.accounts}
            videoTags={data.videoTags}
          />
        </div>
      </section>
    </AdminWorkspaceLayout>
  );
}
