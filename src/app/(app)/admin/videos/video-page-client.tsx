"use client";

import { useCallback, useState } from "react";
import { VideoList } from "./video-list";
import type { AdminVideosPageData } from "@/lib/loaders/admin-videos-page";

type VideoView = "pending" | "all";

interface VideoPageClientProps {
  initialView: VideoView;
  initialData: AdminVideosPageData;
}

export function VideoPageClient({ initialView, initialData }: VideoPageClientProps) {
  const [view, setView] = useState<VideoView>(initialView);
  const [data, setData] = useState<AdminVideosPageData>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const switchView = useCallback(async (nextView: VideoView) => {
    if (nextView === view) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/videos/list?view=${nextView}`);
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminVideosPageData;
      setData(nextData);
      setView(nextView);
      window.history.replaceState({}, "", `/admin/videos?view=${nextView}`);
    } catch {
      // 保持旧数据，静默失败
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  return (
    <section
      id="video-asset-list"
      className="scroll-mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-[#D97757] pl-3">
        <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">资料库</h2>

        <div
          className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
          title="待处理 = 未打标 或 状态异常"
        >
          <button
            type="button"
            onClick={() => switchView("pending")}
            disabled={isLoading}
            className={[
              "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
              view === "pending"
                ? "bg-white text-zinc-800 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            待处理
            <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#D97757]">
              {data.summary.pendingCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchView("all")}
            disabled={isLoading}
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
          </button>

        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          <span>
            已入库
            <span className="ml-0.5 font-mono tabular-nums text-[#6FAA7D]">
              {data.assetSummary.readyCount}
            </span>
          </span>
          <span>
            待整理
            <span className="ml-0.5 font-mono tabular-nums text-[#D99E55]">
              {data.assetSummary.pendingLibraryCount}
            </span>
          </span>
          <span>
            已评级
            <span className="ml-0.5 font-mono tabular-nums text-zinc-700">
              {data.assetSummary.gradedCount}
            </span>
          </span>
        </div>
      </div>

      <VideoList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        videoTags={data.videoTags}
        assetLibrary={data.assetLibrary}
      />
    </section>
  );
}
