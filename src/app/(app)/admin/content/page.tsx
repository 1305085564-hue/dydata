import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import { ContentList } from "./content-list";

export default async function AdminContentPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminContentPageData({ supabase });

  const metrics = [
    { label: "内容总量", value: data.summary.totalVideos, hint: "当前纳入复盘的视频" },
    { label: "已复盘", value: data.summary.reviewedCount, hint: "已有次日复盘结果" },
    { label: "24h 样本", value: data.summary.snapshotCount, hint: "可用于复盘的快照" },
    { label: "待复盘", value: data.summary.pendingReviewCount, hint: "还没处理的内容" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">Content Console</p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-950">内容管理</h1>
        <p className="mt-1 text-sm text-zinc-500">次日复盘工作台</p>
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
        <h2 className="text-lg font-bold text-zinc-950">复盘列表</h2>
        <div className="mt-4">
          <ContentList
            videos={data.videos}
            snapshots={data.snapshots}
            profiles={data.profiles}
            accounts={data.accounts}
            reviewedVideoIds={data.reviewedVideoIds}
          />
        </div>
      </section>
    </div>
  );
}
