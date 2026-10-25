"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContentList } from "./content-list";
import type { AdminContentPageData, AdminContentVideoDetail } from "@/lib/loaders/admin-content-page";
import { buildSnapshotMap, getPriorityScore, pickDirectReviewTarget } from "@/lib/review-queue";
import { classifyVideoAnomalyBucket } from "@/lib/video-anomaly";
import {
  type ContentView,
  useContentPageQuery,
} from "./content-page-query";
import { useContentTopicLibrary } from "./content-topic-library";
import { buildStepContentVideoNavigation, resolveContentVideoPosition } from "./content-video-navigation";
import { getContentReviewOnboardingStepThree } from "./content-review-onboarding";

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
  const {
    data,
    view,
    perspective,
    teamId,
    isLoading,
    selectedVideoId,
    loadData,
    selectVideo,
    closeVideo,
    switchPerspective,
    switchTeam,
  } = useContentPageQuery({
    initialView,
    initialData,
    initialPerspective,
    initialTeamId,
    canSwitchPerspective,
    teams,
    fallbackTeamId: permissionInfo.teamId,
  });
  const listRef = useRef<HTMLElement>(null);
  // A populated server render is not yet interactive. Mark the hydrated list for performance probes.
  useEffect(() => {
    listRef.current?.setAttribute("data-content-ready", "true");
  }, []);
  const refreshList = useCallback(
    () => loadData(view, perspective, teamId, { background: true }),
    [loadData, perspective, teamId, view],
  );
  const handleQueryChange = useCallback(() => {
    void loadData(view, perspective, teamId);
  }, [loadData, perspective, teamId, view]);
  const {
    topicLibraryStatuses,
    videosWithLibraryStatus,
    toggleTopicLibrary: handleToggleTopicLibrary,
  } = useContentTopicLibrary({
    videos: data.videos,
    canReviewContent: permissionInfo.permissions.review_content === true,
    refreshList,
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loadedDetails, setLoadedDetails] = useState<Record<string, AdminContentVideoDetail>>(
    directVideoDetail ? { [directVideoDetail.video.id]: directVideoDetail } : {},
  );
  const [detailError, setDetailError] = useState<{ videoId: string; message: string } | null>(null);
  const [detailRequestAttempt, setDetailRequestAttempt] = useState(0);
  const selectedLoadedDetail = selectedVideoId ? loadedDetails[selectedVideoId] : undefined;

  // 换作品时清掉上一条的详情错误：放在点击入口而不是 effect 里，避免 effect 内同步 setState 触发级联渲染
  const openVideo = useCallback(
    (videoId: string) => {
      setDetailError(null);
      selectVideo(videoId);
    },
    [selectVideo],
  );

  useEffect(() => {
    if (!selectedVideoId || selectedLoadedDetail) return;
    let cancelled = false;
    void fetch(`/api/admin/content/${selectedVideoId}?view=${view}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "详情加载失败");
        return response.json() as Promise<AdminContentVideoDetail>;
      })
      .then((detail) => {
        if (!cancelled) setLoadedDetails((current) => ({ ...current, [detail.video.id]: detail }));
      })
      .catch((error) => {
        if (!cancelled) setDetailError({
          videoId: selectedVideoId,
          message: error instanceof Error ? error.message : "详情加载失败",
        });
      });
    return () => { cancelled = true; };
  }, [detailRequestAttempt, selectedLoadedDetail, selectedVideoId, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (!localStorage.getItem("content-review-onboarding-seen")) {
          setShowOnboarding(true);
        }
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleDismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem("content-review-onboarding-seen", "true");
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  }, []);

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

  // Direct Review handler：优先跳当前列表中最需关注的异常作品
  // 靶子口径：昨天发布的异常作品优先（这个按钮的用法是早上盘昨天的稿），
  // 昨天没有异常时回退到存量最需关注——以前直接取 anomalyVideos[0]，
  // 队列不限时间范围，优先级最高的历史老稿（如 5 月的）常年霸占靶子
  const handleDirectReview = useCallback(() => {
    if (data.summary.directReviewVideoId) {
      openVideo(data.summary.directReviewVideoId);
      return;
    }
    const targetVideo = pickDirectReviewTarget(anomalyVideos) ?? data.videos[0];
    if (targetVideo) {
      openVideo(targetVideo.id);
    } else {
      toast.info("当前列表还没有可复盘的作品");
    }
  }, [anomalyVideos, data.summary.directReviewVideoId, data.videos, openVideo]);

  const reviewVideos = videosWithLibraryStatus;
  const videoPosition = resolveContentVideoPosition({
    videoIds: reviewVideos.map((video) => video.id),
    selectedVideoId,
    pageStartIndex: data.summary.pageStartIndex ?? ((data.summary.page ?? 1) - 1) * (data.summary.pageSize ?? 100),
    totalVideos: data.summary.totalVideos,
  });

  const handleStepVideo = useCallback(
    (direction: "prev" | "next") => {
      const pageIndex = videoPosition.pageIndex;
      if (pageIndex < 0) return;
      const targetIndex = direction === "prev" ? pageIndex - 1 : pageIndex + 1;
      if (targetIndex >= 0 && targetIndex < reviewVideos.length) {
        const targetVideo = reviewVideos[targetIndex];
        if (targetVideo) {
          openVideo(targetVideo.id);
          const nav = buildStepContentVideoNavigation({
            view,
            perspective,
            teamId,
            videoId: targetVideo.id,
            search: window.location.search,
          });
          window.history.replaceState(null, "", nav.href);
        }
        return;
      }
      const currentPage = data.summary.page ?? 1;
      const cursor = direction === "prev" ? data.cursors?.previous : data.cursors?.next;
      const nextPage = currentPage + (direction === "prev" ? -1 : 1);
      if (!cursor || nextPage < 1) {
        toast.info("相邻作品暂时无法定位，请刷新列表后重试");
        return;
      }
      void loadData(view, perspective, teamId, {
        background: true,
        page: nextPage,
        cursor,
        onLoaded: (nextData) => {
          if (nextData.summary.page !== nextPage) return;
          const targetVideo = direction === "prev"
            ? nextData.videos[nextData.videos.length - 1]
            : nextData.videos[0];
          if (!targetVideo) {
            toast.info("相邻作品已变化，请重新打开列表");
            return;
          }
          const params = new URLSearchParams(window.location.search);
          params.set("page", String(nextPage));
          params.set("cursor", cursor);
          const nav = buildStepContentVideoNavigation({
            view,
            perspective,
            teamId,
            videoId: targetVideo.id,
            search: params.toString(),
          });
          openVideo(targetVideo.id);
          window.history.replaceState(null, "", nav.href);
        },
      });
    },
    [data.cursors, data.summary.page, loadData, openVideo, perspective, reviewVideos, teamId, videoPosition.pageIndex, view],
  );

  let diagnosisDrawerNode = null;
  if (selectedVideoId) {
    const selectedDetail = selectedLoadedDetail ?? null;
    const selectedVideo = selectedDetail?.video ?? (directVideoDetail?.video.id === selectedVideoId ? directVideoDetail.video : null);
    const selectedSnapshot = selectedDetail?.snapshot ?? null;
    // 话题分类优先取当前视频的入库状态；深链详情只对「同一个视频」有效，
    // 否则从 URL 打开 A 后再点 B，B 会继承 A 的话题分类（第四格与评级口径都会错）
    const selectedTopicKind = selectedVideo
      ? topicLibraryStatuses[selectedVideo.id]?.topicKind
        ?? (directVideoDetail?.video.id === selectedVideo.id ? directVideoDetail.topicKind : null)
      : null;
    diagnosisDrawerNode = detailError?.videoId === selectedVideoId ? (
      <section role="alert" aria-live="assertive" className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-xl rounded-md border border-status-danger/30 bg-white p-4 text-sm text-status-danger shadow-lg">
        <p>详情没有加载出来，列表摘要不会代替详情显示。</p>
        <p className="mt-1">{detailError.message}</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="s" onClick={() => {
            setDetailError(null);
            setDetailRequestAttempt((attempt) => attempt + 1);
          }}>重试加载详情</Button>
          <Button type="button" size="s" variant="outline" onClick={closeVideo}>返回列表</Button>
        </div>
      </section>
    ) : selectedVideo ? (
      <ContentDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) closeVideo();
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        canOperateLifecycle={permissionInfo.permissions.manage_videos === true}
        canPurge={permissionInfo.companyRole === "company_owner"}
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
        currentIndex={videoPosition.currentIndex}
        totalCount={videoPosition.totalCount}
        onStepVideo={handleStepVideo}
      />
    ) : (
      <div role="status" className="fixed inset-x-4 bottom-6 z-50 rounded-md border border-[#E2E2DF] bg-white p-4 text-sm text-[#78716C] shadow-lg">
        正在加载视频详情…
      </div>
    );
  }

  return (
    <>
      <section
        id="content-review-list"
        ref={listRef}
        aria-busy={isLoading}
        data-content-first-id={data.videos[0]?.id ?? ""}
        className="flex flex-1 flex-col scroll-mt-8"
      >
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-65" : "opacity-100"}`}>
          <ContentList
            videos={videosWithLibraryStatus}
            snapshots={data.snapshots}
            profiles={data.profiles}
            accountOptions={data.accountOptions}
            reviewReadiness={data.reviewReadiness}
            contentQualityByVideoId={data.contentQualityByVideoId}
            view={view}
            onViewChange={(nextView) => void loadData(nextView, perspective, teamId, { resetPage: true })}
            isViewLoading={isLoading}
            perspective={perspective}
            onPerspectiveChange={switchPerspective}
            teamId={teamId}
            onTeamChange={switchTeam}
            teams={teams}
            canSwitchPerspective={canSwitchPerspective}
            canManageVideos={permissionInfo.permissions.manage_videos === true}
            totalVideosCount={data.summary.totalVideos}
            totalPages={data.summary.totalPages}
            serverPage={data.summary.page}
            serverPageSize={data.summary.pageSize}
            serverPaginated
            cursors={data.cursors ?? { previous: null, next: null }}
            availableDates={data.availableDates ?? []}
            availableCounts={data.availableCounts ?? []}
            onQueryChange={handleQueryChange}
            canReviewContent={permissionInfo.permissions.review_content === true}
            onDirectReview={handleDirectReview}
            onSelectVideoId={(videoId) => {
              if (videoId) openVideo(videoId);
              else closeVideo();
            }}
          />
        </div>
      </section>
    {diagnosisDrawerNode}
    {/* 首次引导弹窗：走共享 ui/dialog.tsx，与全站弹层一致地拿到 Esc 关闭、
        role=dialog + aria-labelledby、焦点陷阱与背景滚动锁定（此前是本站唯一自绘浮层）。 */}
    <Dialog
      open={showOnboarding}
      onOpenChange={(open) => {
        if (!open) handleDismissOnboarding();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-[20px]" aria-hidden="true">👋</span>
            欢迎使用视频复盘工作台
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-[#1F1E1D] leading-relaxed">
          复盘页按天组织：打开就停在最近有作品的一天，你可以逐日回看：
        </p>
        <ol className="space-y-2 text-[13px] text-[#1F1E1D]">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-status-danger/10 text-status-danger font-normal text-[12px]">
              1
            </span>
            <span>
              <strong>挑一天来复盘</strong>：打开日历选日期，或点左右箭头逐日切换；日历上能看到每天的作品条数。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-[#D97757]/10 text-[#D97757] font-normal text-[12px]">
              2
            </span>
            <span>
              <strong>看作品与指标</strong>：单日默认按播放量从高到低排，点开作品看完整指标、截图和原视频。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-status-info/10 text-status-info font-normal text-[12px]">
              3
            </span>
            <span>
              <strong>{permissionInfo.permissions.review_content ? "复盘处理" : "查看证据"}</strong>：
              {getContentReviewOnboardingStepThree(permissionInfo.permissions.review_content === true)}
            </span>
          </li>
        </ol>
        <Button
          size="l"
          onClick={handleDismissOnboarding}
          className="w-full mt-2"
        >
          知道了，开始复盘
        </Button>
      </DialogContent>
    </Dialog>
  </>
  );
}
