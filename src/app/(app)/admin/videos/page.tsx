import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
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
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">Video Console</p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-950">视频管理</h1>
        <p className="mt-1 text-sm text-zinc-500">按账号、负责人、日期和状态查看全部视频与 24h 快照。</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">{m.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">{m.value}</p>
            <p className="mt-2 text-xs text-zinc-400">{m.hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">视频列表</h2>
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
    </div>
  );
}
