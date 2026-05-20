import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
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
  if (!canAccessAdminPath("/admin/content", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const params = await searchParams;
  const view = normalizeView(params.view);

  const supabase = await createClient();
  const data = await loadAdminContentPageData({ supabase, view });

  return (
    <AdminWorkspaceLayout
      eyebrow="内容复盘"
      title="内容复盘"
      description="文案拆解、次日复盘、内容判断和下一步动作；原始视频资产留在视频资产页。"
      indexItems={[]}
    >
      <section
        id="content-review-list"
        className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <div className="flex items-center justify-between border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">复盘列表</h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
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
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#D97757]">
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
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
                {data.summary.totalVideos}
              </span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[12px] text-zinc-500">
            <span>已复盘 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{data.summary.reviewedCount}</span></span>
            <span>内容总量 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{data.summary.totalVideos}</span></span>
            <span>24h 样本 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{data.summary.snapshotCount}</span></span>
          </div>
        </div>

        <ContentList
          videos={data.videos}
          snapshots={data.snapshots}
          profiles={data.profiles}
          accounts={data.accounts}
          reviewedVideoIds={data.reviewedVideoIds}
        />
      </section>
    </AdminWorkspaceLayout>
  );
}
