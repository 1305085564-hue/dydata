"use client";

import { useCallback, useState } from "react";
import { ContentList } from "./content-list";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { ContentFeedbackCardView } from "@/types";

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

  const handleFeedbackCardChanged = useCallback((videoId: string, nextCard: ContentFeedbackCardView) => {
    setData((prev) => {
      const nextFeedbackCards = { ...prev.feedbackCards, [videoId]: nextCard };
      const cards = Object.values(nextFeedbackCards);
      const workflowSummary = {
        notStarted: cards.filter((c) => c.workflow_status === "not_started").length,
        draft: cards.filter((c) => c.workflow_status === "draft").length,
        confirmed: cards.filter((c) => c.workflow_status === "confirmed").length,
        sent: cards.filter((c) => c.workflow_status === "sent").length,
        viewed: cards.filter((c) => c.workflow_status === "viewed").length,
        pendingDelivery: cards.filter((c) => c.workflow_status === "draft" || c.workflow_status === "confirmed").length,
      };
      return { ...prev, feedbackCards: nextFeedbackCards, workflowSummary };
    });
  }, []);

  return (
    <section
      id="content-review-list"
      className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
    >
      <div className="flex items-center justify-between border-l-2 border-[#D97757] pl-3">
        <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">批改台</h2>
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
            未开始
            <span className="ml-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
              {data.workflowSummary.notStarted}
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
          <span>AI初稿待确认 <span className="ml-0.5 font-mono tabular-nums text-[#D99E55]">{data.workflowSummary.draft}</span></span>
          <span>已确认待下发 <span className="ml-0.5 font-mono tabular-nums text-[#D99E55]">{data.workflowSummary.confirmed}</span></span>
          <span>已下发 <span className="ml-0.5 font-mono tabular-nums text-[#6FAA7D]">{data.workflowSummary.sent + data.workflowSummary.viewed}</span></span>
        </div>
      </div>

      <ContentList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        feedbackCards={data.feedbackCards}
        onFeedbackCardChanged={handleFeedbackCardChanged}
      />
    </section>
  );
}
