"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, startTransition, useMemo } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentList } from "./content-list";
import { toast } from "sonner";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import type { ContentFeedbackCardView } from "@/types";

const ContentDiagnosisWorkbench = dynamic(
  () => import("./content-diagnosis-workbench").then((module) => module.ContentDiagnosisWorkbench),
  {
    ssr: false,
    loading: () => (
      <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500">
        正在加载诊断工作台…
      </section>
    ),
  },
);

type ContentView = "pending" | "all";
type AdminContentVideo = AdminContentPageData["videos"][number];

interface ContentPageClientProps {
  initialView: ContentView;
  initialData: AdminContentPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
}

function buildContentPageUrl(view: ContentView, perspective: AdminDataPerspective, teamId: string | null) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  return `/admin/content?${params.toString()}`;
}

function buildContentApiUrl(view: ContentView, perspective: AdminDataPerspective, teamId: string | null) {
  const params = new URLSearchParams({ view, scope: perspective, mode: "full" });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  return `/api/admin/content/list?${params.toString()}`;
}

export function ContentPageClient({
  initialView,
  initialData,
  initialPerspective,
  initialTeamId,
  canSwitchPerspective,
  teams,
}: ContentPageClientProps) {
  const [view, setView] = useState<ContentView>(initialView);
  const [data, setData] = useState<AdminContentPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeferredLoading, setIsDeferredLoading] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const hasLoadedFullInitialData = useRef(false);
  const requestSeq = useRef(0);
  const selectedTeamName = teams.find((team) => team.id === teamId)?.name;

  function calculatePriorityScore(v: AdminContentVideo) {
    let score = 0;
    if (v.anomaly_status === "删稿" || v.anomaly_status === "限流") score += 1000;
    if (v.anomaly_status === "投流" || v.anomaly_status === "活动干预") score += 200;
    if (v.play_change_signal === "halve") score += 500;
    if (v.play_change_signal === "surge") score += 100;
    return score;
  }



  const anomalyVideos = useMemo(() => {
    if (!data?.videos) return [];
    return data.videos
      .map((video) => {
        const score = calculatePriorityScore(video);
        return { video, score };
      })
      .filter((item) => item.score >= 200 && (view === "all" || data?.feedbackCards?.[item.video.id]?.workflow_status !== "sent"))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.video);
  }, [data?.videos, data?.feedbackCards, view]);

  const loadData = useCallback(async (
    nextView: ContentView,
    nextPerspective: AdminDataPerspective,
    nextTeamId: string | null,
    options: { background?: boolean } = {},
  ) => {
    const currentSeq = requestSeq.current + 1;
    requestSeq.current = currentSeq;
    if (!options.background) setIsLoading(true);
    try {
      const res = await fetch(buildContentApiUrl(nextView, nextPerspective, nextTeamId));
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminContentPageData;
      if (currentSeq !== requestSeq.current) return;
      startTransition(() => {
        setData(nextData);
        setView(nextView);
        setPerspective(nextPerspective);
        setTeamId(nextTeamId);
      });
      if (!options.background) {
        window.history.replaceState({}, "", buildContentPageUrl(nextView, nextPerspective, nextTeamId));
      }
    } catch {
      // 保持旧数据，静默失败
    } finally {
      if (!options.background && currentSeq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  const loadDeferredData = useCallback(async () => {
    if (!data.isPartial || isLoading || isDeferredLoading) return;
    hasLoadedFullInitialData.current = true;
    setIsDeferredLoading(true);
    try {
      await loadData(view, perspective, teamId, { background: true });
    } finally {
      setIsDeferredLoading(false);
    }
  }, [data.isPartial, isDeferredLoading, isLoading, loadData, perspective, teamId, view]);

  const switchView = useCallback(async (nextView: ContentView) => {
    if (nextView === view) return;
    hasLoadedFullInitialData.current = false;
    await loadData(nextView, perspective, teamId);
  }, [loadData, perspective, teamId, view]);

  const switchPerspective = useCallback(async (nextPerspective: AdminDataPerspective) => {
    if (nextPerspective === perspective) return;
    const nextTeamId = nextPerspective === "team" ? teamId ?? teams[0]?.id ?? null : teamId;
    hasLoadedFullInitialData.current = false;
    await loadData(view, nextPerspective, nextTeamId);
  }, [loadData, perspective, teamId, teams, view]);

  const switchTeam = useCallback(async (nextTeamId: string | null) => {
    if (!nextTeamId) return;
    if (nextTeamId === teamId) return;
    hasLoadedFullInitialData.current = false;
    await loadData(view, "team", nextTeamId);
  }, [loadData, teamId, view]);

  const handleFeedbackCardChanged = useCallback((videoId: string, nextCard: ContentFeedbackCardView) => {
    setData((prev) => {
      const nextFeedbackCards = { ...prev.feedbackCards, [videoId]: nextCard };
      const nextReadiness = { ...prev.reviewReadiness };
      const video = prev.videos.find((item) => item.id === videoId);
      const currentReadiness = prev.reviewReadiness[videoId];
      if (video && currentReadiness) {
        nextReadiness[videoId] = buildContentReviewReadiness({
          video,
          feedbackCard: nextCard,
          hasSnapshot24h: currentReadiness.has_snapshot_24h,
          hasSegments: true,
        });
      }
      const cards = Object.values(nextFeedbackCards);
      const workflowSummary = {
        notStarted: cards.filter((c) => c.workflow_status === "not_started").length,
        draft: cards.filter((c) => c.workflow_status === "draft").length,
        confirmed: cards.filter((c) => c.workflow_status === "confirmed").length,
        sent: cards.filter((c) => c.workflow_status === "sent").length,
        viewed: cards.filter((c) => c.workflow_status === "viewed").length,
        pendingDelivery: cards.filter((c) => c.workflow_status === "draft" || c.workflow_status === "confirmed").length,
      };
      return { ...prev, feedbackCards: nextFeedbackCards, reviewReadiness: nextReadiness, workflowSummary };
    });
  }, []);

  const handleFeedbackCardsChanged = useCallback((nextCards: Record<string, ContentFeedbackCardView>) => {
    setData((prev) => {
      const nextFeedbackCards = { ...prev.feedbackCards, ...nextCards };
      const nextReadiness = { ...prev.reviewReadiness };
      for (const [videoId, nextCard] of Object.entries(nextCards)) {
        const video = prev.videos.find((item) => item.id === videoId);
        const currentReadiness = prev.reviewReadiness[videoId];
        if (!video || !currentReadiness) continue;
        nextReadiness[videoId] = buildContentReviewReadiness({
          video,
          feedbackCard: nextCard,
          hasSnapshot24h: currentReadiness.has_snapshot_24h,
          hasSegments: true,
        });
      }
      const cards = Object.values(nextFeedbackCards);
      const workflowSummary = {
        notStarted: cards.filter((c) => c.workflow_status === "not_started").length,
        draft: cards.filter((c) => c.workflow_status === "draft").length,
        confirmed: cards.filter((c) => c.workflow_status === "confirmed").length,
        sent: cards.filter((c) => c.workflow_status === "sent").length,
        viewed: cards.filter((c) => c.workflow_status === "viewed").length,
        pendingDelivery: cards.filter((c) => c.workflow_status === "draft" || c.workflow_status === "confirmed").length,
      };
      return { ...prev, feedbackCards: nextFeedbackCards, reviewReadiness: nextReadiness, workflowSummary };
    });
  }, []);

  // Compute anomaly counts for narrow alert bar
  const { deletedCount, limitedCount, halvedCount } = useMemo(() => {
    let deleted = 0;
    let limited = 0;
    let halved = 0;
    if (data?.videos) {
      for (const v of data.videos) {
        if (v.anomaly_status === "删稿") {
          deleted++;
        } else if (v.anomaly_status === "限流") {
          limited++;
        }
        if (v.play_change_signal === "halve") {
          halved++;
        }
      }
    }
    return { deletedCount: deleted, limitedCount: limited, halvedCount: halved };
  }, [data?.videos]);


  // Direct Review handler
  const handleDirectReview = useCallback(() => {
    const targetVideo = data.videos.find((v) => {
      const isAnomaly = v.anomaly_status === "删稿" || v.play_change_signal === "halve";
      const card = data.feedbackCards[v.id];
      const status = card?.workflow_status ?? "not_started";
      return isAnomaly && status !== "sent" && status !== "viewed";
    });
    const fallbackVideo = targetVideo || data.videos.find((v) => {
      const card = data.feedbackCards[v.id];
      const status = card?.workflow_status ?? "not_started";
      return status !== "sent" && status !== "viewed";
    });
    if (fallbackVideo) {
      setSelectedVideoId(fallbackVideo.id);
    } else {
      toast.info("今日待复盘视频已全部完成！");
    }
  }, [data.videos, data.feedbackCards]);

  // Transition to next video handler
  const handleGoToNextVideo = useCallback((currentVideoId: string) => {
    const currentIndex = data.videos.findIndex((v) => v.id === currentVideoId);
    if (currentIndex === -1) {
      setSelectedVideoId(null);
      return;
    }
    const nextVideo = data.videos.slice(currentIndex + 1).find((v) => {
      const card = data.feedbackCards[v.id];
      const status = card?.workflow_status ?? "not_started";
      return status !== "sent" && status !== "viewed";
    });
    if (nextVideo) {
      setSelectedVideoId(nextVideo.id);
    } else {
      setSelectedVideoId(null);
      toast.success("已下发，今日待复盘已清完！");
    }
  }, [data.videos, data.feedbackCards]);

  if (selectedVideoId) {
    const selectedVideo = data?.videos?.find((v) => v.id === selectedVideoId) ?? null;
    const selectedSnapshot = data?.snapshots?.find((s) => s.video_id === selectedVideoId && s.snapshot_type === "24h") ?? null;
    const selectedFeedbackCard = data?.feedbackCards?.[selectedVideoId] ?? null;

    return (
      <ContentDiagnosisWorkbench
        video={selectedVideo}
        snapshot={selectedSnapshot}
        feedbackCard={selectedFeedbackCard}
        onFeedbackCardChanged={handleFeedbackCardChanged}
        onClose={() => setSelectedVideoId(null)}
        profiles={data.profiles}
        onGoToNextVideo={handleGoToNextVideo}
        anomalyVideos={anomalyVideos}
        onVideoSelect={setSelectedVideoId}
      />
    );
  }

  return (
    <section
      id="content-review-list"
      className="flex flex-1 flex-col scroll-mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
    >
      {anomalyVideos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] bg-[#FAFAF9] text-stone-600 border border-stone-200 rounded-xl mb-1 hover:border-stone-300 transition-colors">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex size-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C9604D] opacity-75"></span>
              <span className="relative inline-flex rounded-full size-1.5 bg-[#C9604D]"></span>
            </span>
            <span className="font-semibold text-stone-850">
              今日异常雷达
            </span>
            <span className="text-stone-300">|</span>
            <span className="flex items-center gap-1 shrink-0">
              <span>共 {anomalyVideos.length} 条待诊断 </span>
              <span className="text-stone-300">/</span>
              {deletedCount > 0 && <span className="text-[#C9604D] font-medium">{deletedCount} 删稿</span>}
              {limitedCount > 0 && <span className="text-[#C9604D] font-medium">{limitedCount} 限流</span>}
              {halvedCount > 0 && <span className="text-[#D99E55] font-medium">{halvedCount} 腰斩</span>}
            </span>
            <span className="text-stone-300 hidden md:inline">|</span>
            <span className="text-stone-500 truncate max-w-[280px] hidden md:inline" title={anomalyVideos.map(v => `${v.profiles?.name || '未知'}(${v.anomaly_status === '正常' && v.play_change_signal === 'halve' ? '腰斩' : (v.anomaly_status || '未知')})`).join(', ')}>
              最需关注：
              {anomalyVideos.slice(0, 2).map((v, i) => (
                <span key={v.id}>
                  {i > 0 && "、"}
                  <button
                    onClick={() => setSelectedVideoId(v.id)}
                    className="underline decoration-[#D97757]/30 hover:text-[#D97757] font-medium transition-colors"
                  >
                    {v.profiles?.name || "未知"}({v.anomaly_status === "正常" && v.play_change_signal === "halve" ? "腰斩" : (v.anomaly_status || "异常")})
                  </button>
                </span>
              ))}
              {anomalyVideos.length > 2 && ` 等 ${anomalyVideos.length} 条`}
            </span>
          </div>
          <button
            onClick={handleDirectReview}
            className="text-[11px] font-semibold text-[#D97757] hover:text-[#C96442] hover:underline shrink-0"
          >
            直接去盘 →
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
            <button
              type="button"
              onClick={() => switchView("pending")}
              disabled={isLoading}
              className={[
                "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "bg-white text-stone-900"
                  : "text-stone-500 hover:text-stone-700",
              ].join(" ")}
            >
              未开始
              <span className="ml-1.5 text-[12px] tabular-nums text-stone-500">
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
                  ? "bg-white text-stone-900"
                  : "text-stone-500 hover:text-stone-700",
              ].join(" ")}
            >
              全部
              <span className="ml-1.5 text-[12px] tabular-nums text-stone-500">
                {data.summary.totalVideos}
              </span>
            </button>
          </div>

          {canSwitchPerspective ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                <button
                  type="button"
                  onClick={() => switchPerspective("company")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                    perspective === "company"
                      ? "bg-white text-stone-900"
                      : "text-stone-500 hover:text-stone-700",
                  ].join(" ")}
                >
                  公司视角
                </button>
                <button
                  type="button"
                  onClick={() => switchPerspective("team")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                    perspective === "team"
                      ? "bg-white text-stone-900"
                      : "text-stone-500 hover:text-stone-700",
                  ].join(" ")}
                >
                  团队视角
                </button>
              </div>

              {perspective === "team" && teams.length > 0 ? (
                <Select value={teamId ?? teams[0]?.id} onValueChange={switchTeam}>
                  <SelectTrigger className="h-8 min-w-36 rounded-lg border-stone-200 bg-white text-[12px] text-stone-700">
                    <SelectValue placeholder="选择团队">
                      {selectedTeamName ?? undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-500">
          {data.workflowSummary.draft > 0 && (
            <span>
              待确认
              <span className="ml-0.5 tabular-nums text-[#D99E55]">
                {data.workflowSummary.draft}
              </span>
            </span>
          )}
          {data.workflowSummary.confirmed > 0 && (
            <span>
              已确认未发
              <span className="ml-0.5 tabular-nums text-[#D97757]">
                {data.workflowSummary.confirmed}
              </span>
            </span>
          )}
          {data.workflowSummary.sent > 0 && (
            <span>
              已下发
              <span className="ml-0.5 tabular-nums text-[#D97757]">
                {data.workflowSummary.sent}
              </span>
            </span>
          )}
          {data.workflowSummary.viewed > 0 && (
            <span>
              员工已读
              <span className="ml-0.5 tabular-nums text-[#6FAA7D]">
                {data.workflowSummary.viewed}
              </span>
            </span>
          )}
          <span className="pl-2 text-[13px] font-medium text-stone-500">视频复盘</span>
        </div>
      </div>

      <ContentList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        feedbackCards={data.feedbackCards}
        reviewReadiness={data.reviewReadiness}
        totalCount={data.summary.totalVideos}
        hasDeferredData={Boolean(data.isPartial)}
        isDeferredDataLoading={isDeferredLoading}
        onLoadDeferredData={loadDeferredData}
        onFeedbackCardChanged={handleFeedbackCardChanged}
        onFeedbackCardsChanged={handleFeedbackCardsChanged}
        selectedVideoId={selectedVideoId}
        onSelectVideoId={setSelectedVideoId}
      />
    </section>
  );
}
