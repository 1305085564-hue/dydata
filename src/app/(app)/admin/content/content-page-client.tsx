"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
      <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-500">
        正在加载诊断工作台…
      </section>
    ),
  },
);

type ContentView = "pending" | "all";
type AdminContentVideo = AdminContentPageData["videos"][number];

import type { UserPermissionInfo } from "@/lib/permissions";

interface ContentPageClientProps {
  initialView: ContentView;
  initialData: AdminContentPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: UserPermissionInfo;
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
  permissionInfo,
}: ContentPageClientProps) {
  const [view, setView] = useState<ContentView>(initialView);
  const [data, setData] = useState<AdminContentPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeferredLoading, setIsDeferredLoading] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
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
      .filter((item) => {
        const status = data?.feedbackCards?.[item.video.id]?.workflow_status ?? "not_started";
        return item.score >= 200 && status !== "sent" && status !== "viewed";
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.video);
  }, [data?.videos, data?.feedbackCards]);

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
    setIsDeferredLoading(true);
    try {
      await loadData(view, perspective, teamId, { background: true });
    } finally {
      setIsDeferredLoading(false);
    }
  }, [data.isPartial, isDeferredLoading, isLoading, loadData, perspective, teamId, view]);

  const switchPerspective = useCallback(async (nextPerspective: AdminDataPerspective) => {
    if (nextPerspective === perspective) return;
    const nextTeamId = nextPerspective === "team" ? teamId ?? teams[0]?.id ?? null : teamId;
    await loadData(view, nextPerspective, nextTeamId);
  }, [loadData, perspective, teamId, teams, view]);

  const switchTeam = useCallback(async (nextTeamId: string | null) => {
    if (!nextTeamId) return;
    if (nextTeamId === teamId) return;
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
        anomalyVideos={anomalyVideos}
        videos={data.videos}
        snapshots={data.snapshots}
        feedbackCards={data.feedbackCards}
        reviewReadiness={data.reviewReadiness}
        onVideoSelect={setSelectedVideoId}
        canOperateLifecycle={permissionInfo.permissions.manage_videos === true}
        onLifecycleChanged={() => {
          setSelectedVideoId(null);
          void loadData(view, perspective, teamId);
        }}
      />
    );
  }

  return (
    <section
      id="content-review-list"
      className="flex flex-1 flex-col scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs"
    >
      {/* 整合单排顶栏控制舱：Sticky 纸感与环境融合 */}
      <div className="sticky top-[calc(var(--app-top-offset,64px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 px-3.5 py-2.5 backdrop-blur-md transition-all duration-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* 视角切换 Tab：待复盘 VS 全部 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadData("pending", perspective, teamId)}
              className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-all cursor-pointer ${
                view === "pending"
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
              }`}
            >
              待复盘 ({data.summary.pendingReviewCount})
            </button>
            <button
              type="button"
              onClick={() => void loadData("all", perspective, teamId)}
              className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-all cursor-pointer ${
                view === "all"
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
              }`}
            >
              全部 ({data.summary.totalVideos})
            </button>
          </div>

          {/* 团队/公司视角统一选择下拉框 (白底实体按键) */}
          {teams.length > 0 || canSwitchPerspective ? (
            <Select
              value={perspective === "company" ? "all_company" : (teamId ?? teams[0]?.id ?? "all_company")}
              onValueChange={(val) => {
                if (val === "all_company") {
                  void switchPerspective("company");
                } else {
                  void switchTeam(val);
                }
              }}
            >
              <SelectTrigger className="h-7.5 min-w-36 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 hover:border-zinc-300 shadow-2xs cursor-pointer">
                <SelectValue placeholder="选择范围">
                  {perspective === "company" ? "全公司 (全部团队)" : (selectedTeamName ?? "选择团队")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {canSwitchPerspective && (
                  <SelectItem value="all_company" className="text-[12px] font-medium text-zinc-900">
                    全公司 (全部团队)
                  </SelectItem>
                )}
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id} className="text-[12px]">
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {/* 今日异常细条提醒 */}
          {anomalyVideos.length > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] bg-zinc-50/80 text-zinc-600 border border-zinc-200 rounded-lg shadow-2xs">
              <span className="flex size-1.5 shrink-0 rounded-full bg-[#C9604D]" />
              <span className="font-semibold text-zinc-900">
                今日异常 ({anomalyVideos.length})
              </span>
              <span className="text-zinc-300">·</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {deletedCount > 0 && <span className="text-[#C9604D] font-medium">{deletedCount} 删稿</span>}
                {limitedCount > 0 && <span className="text-[#C9604D] font-medium">{limitedCount} 限流</span>}
                {halvedCount > 0 && <span className="text-[#D99E55] font-medium">{halvedCount} 腰斩</span>}
              </span>
              <span className="text-zinc-300 hidden lg:inline">|</span>
              <span className="text-zinc-500 truncate max-w-[200px] hidden lg:inline" title={anomalyVideos.map(v => `${v.profiles?.name || '未知'}(${v.anomaly_status === '正常' && v.play_change_signal === 'halve' ? '腰斩' : (v.anomaly_status || '未知')})`).join(', ')}>
                最需关注: {anomalyVideos.slice(0, 2).map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && "、"}
                    <button
                      type="button"
                      onClick={() => setSelectedVideoId(v.id)}
                      className="text-[#D97757] hover:text-[#C46A4D] underline-offset-2 font-medium transition-colors cursor-pointer"
                    >
                      {v.profiles?.name || "未知"}({v.anomaly_status === "正常" && v.play_change_signal === "halve" ? "腰斩" : (v.anomaly_status || "异常")})
                    </button>
                  </span>
                ))}
              </span>
              <button
                type="button"
                onClick={handleDirectReview}
                className="text-[11px] font-semibold text-[#D97757] hover:text-[#C46A4D] shrink-0 ml-0.5 active:scale-95 transition-all cursor-pointer"
              >
                直接去盘 →
              </button>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/admin/videos"
            className="text-[12px] text-[#D97757] hover:text-[#C46A4D] underline-offset-2 transition-colors font-medium cursor-pointer"
          >
            前往素材库（全量账本）→
          </Link>
        </div>
      </div>

      <ContentList
        videos={data.videos}
        snapshots={data.snapshots}
        feedbackCards={data.feedbackCards}
        reviewReadiness={data.reviewReadiness}
        totalCount={view === "all" ? data.summary.totalVideos : data.summary.pendingReviewCount}
        view={view}
        hasDeferredData={Boolean(data.isPartial)}
        isDeferredDataLoading={isDeferredLoading}
        onLoadDeferredData={loadDeferredData}
        onSelectVideoId={setSelectedVideoId}
      />
    </section>
  );
}
