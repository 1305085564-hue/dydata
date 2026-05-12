import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { ContentList } from "./content-list";

type ContentView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "all" ? "all" : "pending";
}

export default async function AdminContentPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!isAdminLevel(perm.role)) redirect("/dashboard");

  const params = await searchParams;
  const view = normalizeView(params.view);

  const supabase = await createClient();
  const data = await loadAdminContentPageData({ supabase });

  const reviewedSet = new Set(data.reviewedVideoIds);
  const visibleVideos =
    view === "pending" ? data.videos.filter((video) => !reviewedSet.has(video.id)) : data.videos;

  const metrics = [
    { label: "待复盘", value: data.summary.pendingReviewCount, tone: "accent" as const },
    { label: "已复盘", value: data.summary.reviewedCount, tone: "default" as const },
    { label: "内容总量", value: data.summary.totalVideos, tone: "default" as const },
    { label: "24h 样本", value: data.summary.snapshotCount, tone: "default" as const },
  ];

  return (
    <AdminWorkspaceLayout
      eyebrow="Content Review"
      title="内容复盘"
      description="文案拆解、次日复盘、内容判断和下一步动作；原始视频资产留在视频资产页。"
      indexItems={[{ id: "content-review-list", label: "复盘列表", hint: "文案、判断、动作" }]}
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <Link
              href="/admin/content?view=pending"
              className={[
                "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              待复盘
              <span className="ml-1.5 text-[11px] text-[#D97757] font-mono tabular-nums">
                {data.summary.pendingReviewCount}
              </span>
            </Link>
            <Link
              href="/admin/content?view=all"
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
            {metrics.slice(1).map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <span className="text-zinc-400">{m.label}</span>
                <span className="font-mono tabular-nums text-zinc-700">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="content-review-list" className="scroll-mt-8">
        <ContentList
          videos={visibleVideos}
          snapshots={data.snapshots}
          profiles={data.profiles}
          accounts={data.accounts}
          reviewedVideoIds={data.reviewedVideoIds}
        />
      </section>
    </AdminWorkspaceLayout>
  );
}
