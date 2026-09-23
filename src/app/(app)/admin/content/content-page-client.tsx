"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, startTransition, useMemo } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentList } from "./content-list";
import { toast } from "sonner";
import type { AdminContentPageData, AdminContentVideoDetail } from "@/lib/loaders/admin-content-page";
import { buildSnapshotMap, getPriorityScore, pickDirectReviewTarget } from "@/lib/review-queue";
import { classifyVideoAnomalyBucket, resolveVideoStatusLabel } from "@/lib/video-anomaly";
import { buildTopicLibraryStatusRequests } from "./topic-library-status-request";
import { parseContentListFilters } from "./content-list-filters";
import type { VideoTopicKind, VideoTopicLibraryStatus } from "@/lib/topics/library";
import {
  buildContentPageUrl,
  resolveContentPageStateFromSearch,
} from "./content-video-navigation";

const ContentDetailDialog = dynamic(
  () => import("./content-detail-dialog").then((module) => module.ContentDetailDialog),
  {
    ssr: false,
    loading: () => (
      <section className="flex min-h-[360px] flex-col items-center justify-center py-16 text-center text-[13px] text-[#78716C]">
        正在加载视频详情…
      </section>
    ),
  },
);

type ContentView = "all" | "trash";
type AdminContentVideo = AdminContentPageData["videos"][number];
type TopicLibraryStatusInfo = {
  status: VideoTopicLibraryStatus;
  subTopicId: string | null;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind: VideoTopicKind;
};

import type { UserPermissionInfo } from "@/lib/permissions";

interface ContentPageClientProps {
  initialView: ContentView;
  initialData: AdminContentPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: UserPermissionInfo;
  directVideoDetail: AdminContentVideoDetail | null;
}

function buildContentApiUrl(
  view: ContentView,
  perspective: AdminDataPerspective,
  teamId: string | null,
  options: { fresh?: boolean } = {},
) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  // 写操作后的首次取数：服务端跳过 60 秒缓存并回填，浏览器也不复用旧响应
  if (options.fresh) params.set("fresh", "1");
  return `/api/admin/content/list?${params.toString()}`;
}

function readCurrentListFilters() {
  if (typeof window === "undefined") return undefined;
  return parseContentListFilters(new URLSearchParams(window.location.search));
}

export function ContentPageClient({
  initialView,
  initialData,
  initialPerspective,
  initialTeamId,
  canSwitchPerspective,
  teams,
  permissionInfo,
  directVideoDetail,
}: ContentPageClientProps) {
  const searchParams = useSearchParams();
  const urlVideoId = searchParams.get("videoId");
  const [view, setView] = useState<ContentView>(initialView);
  const [data, setData] = useState<AdminContentPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const [topicLibraryStatuses, setTopicLibraryStatuses] = useState<Record<string, TopicLibraryStatusInfo>>({});
  const requestSeq = useRef(0);
  // 已成功加载状态的视频 ID 签名；相同签名不重复请求，切换视角/入库操作后置空强制刷新
  const topicStatusKeyRef = useRef<string | null>(null);
  const topicStatusAbortRef = useRef<AbortController | null>(null);
  const selectedTeamName = teams.find((team) => team.id === teamId)?.name;

  const [clientSelectedVideoId, setClientSelectedVideoId] = useState<string | null | undefined>(undefined);
  const selectedVideoId = clientSelectedVideoId !== undefined ? clientSelectedVideoId : urlVideoId;
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("content-review-onboarding-seen")) {
        setShowOnboarding(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem("content-review-onboarding-seen", "true");
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  }, []);

  const selectVideo = useCallback(
    (videoId: string) => {
      setClientSelectedVideoId(videoId);
      const newUrl = buildContentPageUrl({
        view,
        perspective,
        teamId,
        videoId,
        filters: readCurrentListFilters(),
      });
      window.history.pushState(null, "", newUrl);
    },
    [perspective, teamId, view],
  );

  const closeVideo = useCallback(() => {
    setClientSelectedVideoId(null);
    const newUrl = buildContentPageUrl({
      view,
      perspective,
      teamId,
      videoId: null,
      filters: readCurrentListFilters(),
    });
    window.history.pushState(null, "", newUrl);
  }, [perspective, teamId, view]);

  // Topics V3：选题库入库状态来自服务端真实字段（话题标签 + 24h 快照 + 选题入库状态）
  const loadTopicLibraryStatuses = useCallback(async (videos: AdminContentVideo[]) => {
    const ids = videos.map((video) => video.id).filter(Boolean);
    const signature = [...ids].sort().join(",");
    if (signature === topicStatusKeyRef.current) return;
    if (!ids.length) {
      topicStatusKeyRef.current = signature;
      return;
    }
    // 新请求发起时取消仍在途的旧请求，避免过期结果覆盖新列表状态
    topicStatusAbortRef.current?.abort();
    const controller = new AbortController();
    topicStatusAbortRef.current = controller;
    // 接口单次最多 400 个 ID：全量列表（1800+ 条）必须分批请求后再合并，
    // 否则第 401 名之后的视频永久缺失入库状态与话题分类
    const requests = buildTopicLibraryStatusRequests(ids);
    const merged: Record<string, TopicLibraryStatusInfo> = {};
    let failedBatches = 0;
    try {
      const responses = await Promise.all(
        requests.map(async (request) => {
          try {
            const res = await fetch(request.url, { ...request.init, signal: controller.signal });
            if (!res.ok) throw new Error("选题库状态加载失败");
            return (await res.json()) as { statuses?: Record<string, TopicLibraryStatusInfo> };
          } catch (error) {
            if (controller.signal.aborted) throw error;
            failedBatches += 1;
            return null;
          }
        }),
      );
      if (controller.signal.aborted) return;
      for (const payload of responses) {
        if (payload?.statuses) Object.assign(merged, payload.statuses);
      }
      if (Object.keys(merged).length === 0) {
        toast.error("选题库状态加载失败，请稍后重试");
        return;
      }
      // 部分批次失败时不记录签名，下次列表变化会重试；未覆盖的视频按「话题未识别」处理（不出评级）
      if (failedBatches === 0) {
        topicStatusKeyRef.current = signature;
      } else {
        toast.error(`选题库状态有 ${failedBatches} 批未加载成功，未覆盖的视频暂不显示入库状态与评级`);
      }
      setTopicLibraryStatuses(merged);
    } catch {
      if (controller.signal.aborted) return;
      toast.error("选题库状态加载失败，请稍后重试");
    }
  }, []);

  useEffect(() => {
    if (!permissionInfo.permissions.review_content) {
      setTopicLibraryStatuses({});
      return;
    }
    // 列表变化时按需拉取选题库状态（请求生命周期状态）
    void loadTopicLibraryStatuses(data.videos);
  }, [data.videos, loadTopicLibraryStatuses, permissionInfo.permissions.review_content]);

  const videosWithLibraryStatus = useMemo(
    () => data.videos.map((video) => ({
      ...video,
      topic_library_status: topicLibraryStatuses[video.id]?.status ?? null,
      topic_library_sub_topic_id: topicLibraryStatuses[video.id]?.subTopicId ?? null,
    })),
    [data.videos, topicLibraryStatuses],
  );

  // 优先分唯一来源是库侧 getPriorityScore()：客户端不再维护第二套分值，
  // 否则「最需关注 / 直接去盘」的顺序与列表优先队列不一致（历史 bug）
  const prioritySnapshots = useMemo(() => buildSnapshotMap(data.snapshots), [data.snapshots]);

  const anomalyVideos = useMemo(() => {
    if (!videosWithLibraryStatus.length) return [];
    return videosWithLibraryStatus
      // 异常口径与提醒条分桶共用同一个分类函数：进队列 = 能归入某个桶，
      // 这样「提醒条总数」与「各桶相加」在构造上就一致，不会一个 68 一个 69
      .filter((video) => classifyVideoAnomalyBucket(video) !== null)
      .map((video) => ({
        video,
        score: getPriorityScore(video, prioritySnapshots.get(video.id), data.reviewReadiness[video.id]),
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.video);
  }, [videosWithLibraryStatus, prioritySnapshots, data.reviewReadiness]);

  const loadData = useCallback(async (
    nextView: ContentView,
    nextPerspective: AdminDataPerspective,
    nextTeamId: string | null,
    options: { background?: boolean; fresh?: boolean } = {},
  ) => {
    const currentSeq = requestSeq.current + 1;
    requestSeq.current = currentSeq;
    if (!options.background) setIsLoading(true);
    try {
      const res = await fetch(buildContentApiUrl(nextView, nextPerspective, nextTeamId, { fresh: options.fresh }));
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminContentPageData;
      if (currentSeq !== requestSeq.current) return false;
      startTransition(() => {
        setData(nextData);
        setView(nextView);
        setPerspective(nextPerspective);
        setTeamId(nextTeamId);
      });
      if (!options.background) {
        // 数据已由上面的客户端 fetch 就地换好；这里只镜像地址栏（可分享、刷新留在当前视图）。
        // 用 history.replaceState 而非 router.replace：后者会让 page.tsx 的 Suspense key 随
        // view/perspective/teamId 变化 → 整块重挂露 TableSkeleton，并再跑一次服务器取数（与上面重复）。
        window.history.replaceState(null, "", buildContentPageUrl({
          view: nextView,
          perspective: nextPerspective,
          teamId: nextTeamId,
          videoId: null,
          filters: readCurrentListFilters(),
        }));
      }
      return true;
    } catch {
      // 保持旧数据，但必须明确告知：静默失败会让人拿着上一次的数当最新证据下判断
      toast.error("列表刷新失败，当前显示的仍是上次的数据");
      return false;
    } finally {
      if (!options.background && currentSeq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const availableTeamIds = teams.length > 0
        ? teams.map((team) => team.id)
        : [permissionInfo.teamId].filter((id): id is string => Boolean(id));
      const nextState = resolveContentPageStateFromSearch(window.location.search, {
        canSwitchPerspective,
        availableTeamIds,
        fallbackTeamId: permissionInfo.teamId,
      });
      const shouldReloadList =
        nextState.view !== view ||
        nextState.perspective !== perspective ||
        nextState.teamId !== teamId;

      if (shouldReloadList) {
        setClientSelectedVideoId(null);
        void loadData(
          nextState.view,
          nextState.perspective,
          nextState.teamId,
          { background: true },
        ).then((loaded) => {
          if (loaded) setClientSelectedVideoId(nextState.videoId);
        });
        return;
      }

      setClientSelectedVideoId(nextState.videoId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    canSwitchPerspective,
    loadData,
    permissionInfo.teamId,
    perspective,
    teamId,
    teams,
    view,
  ]);

  const handleToggleTopicLibrary = useCallback(async (videoId: string, action: "remove" | "restore") => {
    const subTopicId = topicLibraryStatuses[videoId]?.subTopicId ?? null;
    if (!subTopicId) {
      throw new Error("未找到该视频对应的选题记录，无法操作");
    }
    const res = await fetch("/api/admin/topics-library/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subTopicId, action }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "操作失败，请重试");
    }
    // 入库状态已在服务端变更，置空签名让列表刷新后强制重算该列表状态
    topicStatusKeyRef.current = null;
    await loadData(view, perspective, teamId, { background: true });
  }, [topicLibraryStatuses, loadData, view, perspective, teamId]);

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

  // Compute anomaly counts for narrow alert bar
  // 提醒条口径 = 异常徽标（含 abnormal）+ 腰斩信号；「今日异常」这个名字与实际统计范围不符已改名
  // 分桶互斥（一条视频只进一个桶，优先级与列表徽标一致）：以前「腰斩」在 else-if 链外单独计数，
  // 既是限流又腰斩的稿子会被算两次，出现「总数 68、明细相加 69」的对不上账
  const { deletedCount, limitedCount, boostedCount, abnormalCount, halvedCount, anomalyBucketTotal } = useMemo(() => {
    let deleted = 0;
    let limited = 0;
    let boosted = 0;
    let abnormal = 0;
    let halved = 0;
    if (data?.videos) {
      for (const v of data.videos) {
        switch (classifyVideoAnomalyBucket(v)) {
          case "deleted":
            deleted++;
            break;
          case "limited":
            limited++;
            break;
          case "boosted":
            boosted++;
            break;
          case "abnormal":
            abnormal++;
            break;
          case "halved":
            halved++;
            break;
          default:
            break;
        }
      }
    }
    return {
      deletedCount: deleted,
      limitedCount: limited,
      boostedCount: boosted,
      abnormalCount: abnormal,
      halvedCount: halved,
      // 总数用各桶相加，不再另算一遍长度：明细与总数在构造上必然对得上
      anomalyBucketTotal: deleted + limited + boosted + abnormal + halved,
    };
  }, [data.videos]);


  // Direct Review handler：优先跳当前列表中最需关注的异常作品
  // 靶子口径：昨天发布的异常作品优先（这个按钮的用法是早上盘昨天的稿），
  // 昨天没有异常时回退到存量最需关注——以前直接取 anomalyVideos[0]，
  // 队列不限时间范围，优先级最高的历史老稿（如 5 月的）常年霸占靶子
  const handleDirectReview = useCallback(() => {
    const targetVideo = pickDirectReviewTarget(anomalyVideos) ?? data.videos[0];
    if (targetVideo) {
      selectVideo(targetVideo.id);
    } else {
      toast.info("当前列表暂无可复盘作品");
    }
  }, [anomalyVideos, data.videos, selectVideo]);

  const reviewVideos = useMemo(() => {
    if (!directVideoDetail) return videosWithLibraryStatus;
    const directVideo = {
      ...directVideoDetail.video,
      topic_library_status: topicLibraryStatuses[directVideoDetail.video.id]?.status ?? null,
      topic_library_sub_topic_id: topicLibraryStatuses[directVideoDetail.video.id]?.subTopicId ?? null,
    };
    return [directVideo, ...videosWithLibraryStatus.filter((video) => video.id !== directVideo.id)];
  }, [directVideoDetail, topicLibraryStatuses, videosWithLibraryStatus]);

  const reviewSnapshots = useMemo(() => {
    const directSnapshot = directVideoDetail?.snapshot;
    if (!directSnapshot) return data.snapshots;
    return [directSnapshot, ...data.snapshots.filter((snapshot) => snapshot.video_id !== directSnapshot.video_id)];
  }, [data.snapshots, directVideoDetail]);

  let diagnosisDrawerNode = null;
  if (selectedVideoId) {
    const selectedVideo = reviewVideos.find((v) => v.id === selectedVideoId) ?? null;
    const selectedSnapshot = reviewSnapshots.find((s) => s.video_id === selectedVideoId && s.snapshot_type === "24h") ?? null;
    // 话题分类优先取当前视频的入库状态；深链详情只对「同一个视频」有效，
    // 否则从 URL 打开 A 后再点 B，B 会继承 A 的话题分类（第四格与评级口径都会错）
    const selectedTopicKind = selectedVideo
      ? topicLibraryStatuses[selectedVideo.id]?.topicKind
        ?? (directVideoDetail?.video.id === selectedVideo.id ? directVideoDetail.topicKind : null)
      : null;
    diagnosisDrawerNode = (
      <ContentDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) closeVideo();
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        canOperateLifecycle={permissionInfo.permissions.manage_videos === true}
        canPurge={permissionInfo.companyRole === "company_owner" || permissionInfo.groupMode === true}
        onLifecycleChanged={() => {
          closeVideo();
          // 生命周期动作与 24h 补录都是写操作：绕过 60 秒缓存取最新列表，
          // 否则「刚移入回收站的作品」还会留在「全部」里最长一分钟
          void loadData(view, perspective, teamId, { fresh: true });
        }}
        onToggleTopicLibrary={permissionInfo.permissions.review_content && selectedVideo
          ? (action) => handleToggleTopicLibrary(selectedVideo.id, action)
          : undefined}
        topicLibraryStatus={permissionInfo.permissions.review_content && selectedVideo
          ? topicLibraryStatuses[selectedVideo.id]?.status ?? null
          : null}
        topicKind={selectedTopicKind}
      />
    );
  }

  return (
    <>
      <section
        id="content-review-list"
        className="flex flex-1 flex-col scroll-mt-8 space-y-6"
      >
      {/* 整合单排顶栏控制舱：Sticky 纸感与环境融合 */}
      <div className="sticky top-[calc(var(--app-top-offset,64px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E2DF]/80 bg-[#FCFCFB]/85 px-3.5 py-2.5 backdrop-blur-md transition-all duration-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* 视角切换 Tab：全部 VS 回收站 */}
          {/* 条数只标在当前视角自己的 Tab 上：另一个视角的条数需要再取一次全量列表
              （数据范围是内存过滤，count 查询算不出范围后的数），挂过去就会出现
              「在回收站里看到 全部 (18)」这种计数错位 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadData("all", perspective, teamId)}
              className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-all cursor-pointer ${
                view === "all"
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
              }`}
            >
              全部{view === "all" && (
                <> (<span className="tabular-nums">{data.summary.totalVideos}</span>)</>
              )}
            </button>
            {permissionInfo.permissions.manage_videos === true && (
              <button
                type="button"
                onClick={() => void loadData("trash", perspective, teamId)}
                className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-all cursor-pointer ${
                  view === "trash"
                    ? "bg-[#C9604D]/10 text-[#C9604D] font-semibold"
                    : "text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
                }`}
              >
                回收站{view === "trash" && (
                  <> (<span className="tabular-nums">{data.summary.totalVideos}</span>)</>
                )}
              </button>
            )}
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
              <SelectTrigger className="h-7 min-w-36 rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 text-[12px] font-medium text-[#292524] hover:border-[#78716C]/40 shadow-input cursor-pointer active:scale-[0.99] active:duration-120">
                <SelectValue placeholder="选择范围">
                  {perspective === "company" ? "全公司 (全部团队)" : (selectedTeamName ?? "选择团队")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {canSwitchPerspective && (
                  <SelectItem value="all_company" className="text-[12px] font-medium text-[#1C1917]">
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

          {/* 异常细条提醒：只属于「全部」视角——回收站里的存量异常与本视图的回收/恢复判断无关 */}
          {view === "all" && anomalyVideos.length > 0 && (
            <div className="flex flex-wrap max-w-full items-center gap-2 px-2.5 py-1 text-[11px] bg-[#FCFCFB]/80 text-[#292524] border border-[#E2E2DF] rounded-lg shadow-2xs">
              <span className="flex size-1.5 shrink-0 rounded-full bg-[#C9604D]" />
              <span className="font-semibold text-[#1C1917]" title="当前筛选范围内全部时间的异常作品（异常徽标 + 腰斩信号），不是「今天新增」；总数 = 各分类相加">
                异常提醒 ({anomalyBucketTotal})
              </span>
              <span className="text-[#E2E2DF]">·</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {abnormalCount > 0 && <span className="text-[#C9604D] font-medium">{abnormalCount} 异常</span>}
                {deletedCount > 0 && <span className="text-[#C9604D] font-medium">{deletedCount} 删稿</span>}
                {limitedCount > 0 && <span className="text-[#C9604D] font-medium">{limitedCount} 限流</span>}
                {boostedCount > 0 && <span className="text-[#B98A54] font-medium">{boostedCount} 投流/活动干预</span>}
                {halvedCount > 0 && <span className="text-[#B98A54] font-medium">{halvedCount} 腰斩</span>}
              </span>
              <span className="text-[#E2E2DF] hidden lg:inline">|</span>
              <span className="text-[#78716C] truncate max-w-[200px] hidden lg:inline" title={anomalyVideos.map((v) => `${v.profiles?.name || "未知"}(${resolveVideoStatusLabel({ anomalyStatus: v.anomaly_status, playChangeSignal: v.play_change_signal })})`).join(", ")}>
                最需关注: {anomalyVideos.slice(0, 2).map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && "、"}
                    <button
                      type="button"
                      onClick={() => selectVideo(v.id)}
                      className="text-[#D97757] hover:text-[#C46A4D] underline-offset-2 font-medium transition-colors cursor-pointer"
                    >
                      {v.profiles?.name || "未知"}({resolveVideoStatusLabel({ anomalyStatus: v.anomaly_status, playChangeSignal: v.play_change_signal })})
                    </button>
                  </span>
                ))}
              </span>
              <button
                type="button"
                onClick={() => handleDirectReview()}
                title="打开昨天发布的异常作品；昨天没有异常时打开最近 7 天的异常，再没有才回到存量最需关注"
                className="text-[11px] font-semibold text-[#D97757] hover:text-[#C46A4D] shrink-0 ml-0.5 active:scale-[0.99] active:duration-120 transition-all cursor-pointer"
              >
                直接去盘 →
              </button>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
        </div>
      </div>

      <div className={`transition-opacity duration-200 ${isLoading ? "opacity-65 pointer-events-none" : "opacity-100"}`}>
        <ContentList
          videos={videosWithLibraryStatus}
          snapshots={data.snapshots}
          profiles={data.profiles}
          reviewReadiness={data.reviewReadiness}
          view={view}
          canReviewContent={permissionInfo.permissions.review_content === true}
          onSelectVideoId={(videoId) => {
            if (videoId) selectVideo(videoId);
            else closeVideo();
          }}
        />
      </div>
    </section>
    {diagnosisDrawerNode}
    {showOnboarding && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="欢迎使用视频复盘工作台"
          className="w-full max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">👋</span>
            <h3 className="text-[16px] font-semibold text-[#1C1917]">
              欢迎使用视频复盘工作台
            </h3>
          </div>
          <p className="text-[13px] text-[#78716C] leading-relaxed">
            这里专为管理者打造，旨在 30 秒内快速抓住一条视频的核心问题并完成闭环：
          </p>
          <ol className="space-y-2.5 text-[13px] text-[#292524]">
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-[#C9604D]/10 text-[#C9604D] font-semibold text-[11px]">
                1
              </span>
              <span>
                <strong>先看异常与指标</strong>：用列表筛选定位作品，打开抽屉查看完整指标和原视频。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-[#D97757]/10 text-[#D97757] font-semibold text-[11px]">
                2
              </span>
              <span>
                <strong>截图对照</strong>：结合流量曲线和留存脱落截图，看观众在哪个句段离开。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-[#43718E]/10 text-[#43718E] font-semibold text-[11px]">
                3
              </span>
              <span>
                <strong>闭环处理</strong>：查看指标、复制文案、进入选题库或处理回收站。
              </span>
            </li>
          </ol>
          <button
            type="button"
            onClick={handleDismissOnboarding}
            className="w-full rounded-xl bg-[#D97757] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#C46A4D] transition-colors cursor-pointer shadow-sm mt-2"
          >
            知道了，开始复盘
          </button>
        </div>
      </div>
    )}
  </>
  );
}
