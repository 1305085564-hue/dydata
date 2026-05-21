"use client";

import { useCallback, useState } from "react";
import { ContentList } from "./content-list";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";

type ContentView = "pending" | "all";

interface ContentPageClientProps {
  initialView: ContentView;
  initialData: AdminContentPageData;
}

export function ContentPageClient({ initialView, initialData }: ContentPageClientProps) {
  const [view, setView] = useState<ContentView>(initialView);
  const [data, setData] = useState<AdminContentPageData>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const switchView = useCallback(async (nextView: ContentView) => {
    if (nextView === view) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/content/list?view=${nextView}`);
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminContentPageData;
      setData(nextData);
      setView(nextView);
      window.history.replaceState({}, "", `/admin/content?view=${nextView}`);
    } catch {
      // 保持旧数据，静默失败
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  return (
    <section
      id="content-review-list"
      className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
    >
      <div className="flex items-center justify-between border-l-2 border-[#D97757] pl-3">
        <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">复盘列表</h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          <button
            type="button"
            onClick={() => switchView("pending")}
            disabled={isLoading}
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
          </button>
          <button
            type="button"
            onClick={() => switchView("all")}
            disabled={isLoading}
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
          </button>
          {isLoading && (
            <span className="ml-2 inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          )}
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
  );
}
