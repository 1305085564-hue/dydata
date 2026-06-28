"use client";

import { useCallback, useEffect, useRef, useState, startTransition, useMemo } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ContentList } from "./content-list";
import { ContentDiagnosisWorkbench } from "./content-diagnosis-workbench";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import type { ContentFeedbackCardView } from "@/types";

type ContentView = "pending" | "all";

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

  function calculatePriorityScore(v: any) {
    let score = 0;
    if (v.anomaly_status === "删稿" || v.anomaly_status === "限流") score += 1000;
    if (v.anomaly_status === "投流" || v.anomaly_status === "活动干预") score += 200;
    if (v.play_change_signal === "halve") score += 500;
    if (v.play_change_signal === "surge") score += 100;
    return score;
  }

  function formatNumber(v: number | null | undefined) {
    if (v == null) return "-";
    return new Intl.NumberFormat("zh-CN").format(Math.round(v));
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

  useEffect(() => {
    if (!data.isPartial || hasLoadedFullInitialData.current) return;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const loadFullData = () => {
      if (hasLoadedFullInitialData.current) return;
      hasLoadedFullInitialData.current = true;
      setIsDeferredLoading(true);
      void loadData(view, perspective, teamId, { background: true }).finally(() => {
        setIsDeferredLoading(false);
      });
    };

    const scheduleLoad = () => {
      timeoutId = window.setTimeout(() => {
        if ("requestIdleCallback" in window) {
          idleId = window.requestIdleCallback(loadFullData, { timeout: 2500 });
          return;
        }
        loadFullData();
      }, 1200);
    };

    if (document.readyState === "complete") {
      scheduleLoad();
    } else {
      window.addEventListener("load", scheduleLoad, { once: true });
    }

    return () => {
      window.removeEventListener("load", scheduleLoad);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [data.isPartial, loadData, perspective, teamId, view]);

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

  if (selectedVideoId) {
    const selectedVideo = data?.videos?.find((v) => v.id === selectedVideoId) ?? null;
    const selectedSnapshot = data?.snapshots?.find((s) => s.video_id === selectedVideoId && s.snapshot_type === "24h") ?? null;
    const selectedFeedbackCard = data?.feedbackCards?.[selectedVideoId] ?? null;

    return (
      <ContentDiagnosisWorkbench
        videoId={selectedVideoId}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        feedbackCard={selectedFeedbackCard}
        onFeedbackCardChanged={handleFeedbackCardChanged}
        onClose={() => setSelectedVideoId(null)}
      />
    );
  }

  return (
    <section
      id="content-review-list"
      className="flex flex-1 flex-col scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
    >
      {anomalyVideos.length > 0 && (
        <div className="mb-2 space-y-2 border-b border-zinc-100 pb-5">
          <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-red-500"></span>
            </span>
            异常预警雷达 (Anomaly Radar)
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 pt-1 -mx-5 px-5 scrollbar-thin scrollbar-thumb-zinc-200">
            {anomalyVideos.map((v) => {
              const snap = data?.snapshots?.find((s) => s.video_id === v.id && s.snapshot_type === "24h");
              return (
                <div
                  key={v.id}
                  className="group relative flex flex-col justify-between w-[220px] shrink-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 hover:shadow transition-all duration-200"
                >
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-zinc-400 font-medium truncate max-w-[120px]">
                        {(v.profiles?.name || "未知")} · {(v.accounts?.name || "未知")}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium scale-90 ${
                        v.anomaly_status === "限流" || v.anomaly_status === "删稿"
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : "bg-amber-50 text-amber-600 border border-amber-100"
                      }`}>
                        {v.anomaly_status === "正常" ? "限流异常" : v.anomaly_status}
                      </span>
                    </div>
                    <h3 className="text-[11px] font-semibold text-zinc-800 line-clamp-2 leading-relaxed" title={v.video_title || v.content}>
                      {v.video_title || v.content || "（无标题）"}
                    </h3>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between">
                    <div className="flex flex-col text-left">
                      <span className="text-[8px] text-zinc-400">24h播放</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-700">
                        {snap ? formatNumber(snap.play_count) : "—"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setSelectedVideoId(v.id)}
                      className="h-6 rounded-lg bg-zinc-900 px-2.5 text-[9px] text-white hover:bg-zinc-800 transition-colors"
                    >
                      去诊断
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
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
          </div>

          {canSwitchPerspective ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => switchPerspective("company")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1.5 text-[12px] tracking-tight transition-colors",
                    perspective === "company"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
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
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  ].join(" ")}
                >
                  团队视角
                </button>
              </div>

              {perspective === "team" && teams.length > 0 ? (
                <Select value={teamId ?? teams[0]?.id} onValueChange={switchTeam}>
                  <SelectTrigger className="h-8 min-w-36 rounded-lg border-zinc-200 bg-white text-[12px] text-zinc-700">
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

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          {data.workflowSummary.draft > 0 && (
            <span>
              待确认
              <span className="ml-0.5 font-mono tabular-nums text-[#D99E55]">
                {data.workflowSummary.draft}
              </span>
            </span>
          )}
          {data.workflowSummary.confirmed > 0 && (
            <span>
              已确认未发
              <span className="ml-0.5 font-mono tabular-nums text-[#D97757]">
                {data.workflowSummary.confirmed}
              </span>
            </span>
          )}
          {data.workflowSummary.sent > 0 && (
            <span>
              已下发
              <span className="ml-0.5 font-mono tabular-nums text-[#D97757]">
                {data.workflowSummary.sent}
              </span>
            </span>
          )}
          {data.workflowSummary.viewed > 0 && (
            <span>
              员工已读
              <span className="ml-0.5 font-mono tabular-nums text-[#6FAA7D]">
                {data.workflowSummary.viewed}
              </span>
            </span>
          )}
          <span className="pl-2 text-[15px] font-medium tracking-tight text-zinc-400">批改台</span>
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
