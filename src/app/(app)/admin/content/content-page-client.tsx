"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { Button } from "@/components/ui/button";
import { ContentList } from "./content-list";
import type { AdminContentPageData, AdminContentVideoDetail } from "@/lib/loaders/admin-content-page";
import {
  type ContentView,
  useContentPageQuery,
} from "./content-page-query";
import { useContentTopicLibrary } from "./content-topic-library";
import { buildStepContentVideoNavigation, resolveContentVideoPosition } from "./content-video-navigation";

const ContentDetailDialog = dynamic(
  () => import("./content-detail-dialog").then((module) => module.ContentDetailDialog),
  {
    ssr: false,
    loading: () => (
      <section className="flex min-h-[360px] flex-col items-center justify-center py-16 text-center text-[14px] text-[#78716C]">
        正在加载视频详情…
      </section>
    ),
  },
);

const AuthorWorksDrawer = dynamic(
  () => import("./author-works-drawer").then((module) => module.AuthorWorksDrawer),
  { ssr: false },
);

/**
 * 与 ContentDetailDialog 的 dynamic() 指向同一个模块：列表空闲或首次悬停时先触发，
 * 让详情 chunk 与详情 API 并行加载，点开时不再先等脚本再等接口。
 */
function preloadContentDetailDialogModule() {
  return import("./content-detail-dialog");
}

// 稳定空数组引用，避免每次渲染都给 memo 化的 ContentList 传新 prop。
const EMPTY_DATES: string[] = [];
const EMPTY_COUNTS: Array<{ d: string; c: number }> = [];

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
    selectedAuthorId,
    loadData,
    selectVideo,
    closeVideo,
    selectAuthor,
    closeAuthor,
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

  const detailModulePreloadStartedRef = useRef(false);
  const preloadDetailDialog = useCallback(() => {
    if (detailModulePreloadStartedRef.current) return;
    detailModulePreloadStartedRef.current = true;
    void preloadContentDetailDialogModule().catch(() => {
      // 预加载失败不改变功能；允许下一次悬停/点击再试。
      detailModulePreloadStartedRef.current = false;
    });
  }, []);
  // 列表空闲时提前把详情 chunk 拉下来；不支持 requestIdleCallback 的环境延后一次再拉。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(() => preloadDetailDialog(), { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => preloadDetailDialog(), 1500);
    return () => window.clearTimeout(timer);
  }, [preloadDetailDialog]);
  const handleListPointerEnter = useCallback(() => {
    preloadDetailDialog();
  }, [preloadDetailDialog]);
  const refreshList = useCallback(
    () => loadData(view, perspective, teamId, { background: true }),
    [loadData, perspective, teamId, view],
  );
  const handleQueryChange = useCallback(() => {
    void loadData(view, perspective, teamId);
  }, [loadData, perspective, teamId, view]);
  const handleViewChange = useCallback((nextView: ContentView) => {
    void loadData(nextView, perspective, teamId, { resetPage: true });
  }, [loadData, perspective, teamId]);
  const {
    topicLibraryStatuses,
    videosWithLibraryStatus,
    toggleTopicLibrary: handleToggleTopicLibrary,
  } = useContentTopicLibrary({
    videos: data.videos,
    initialTopicLibraryStatuses: data.topicLibraryStatuses,
    canReviewContent: permissionInfo.permissions.review_content === true,
    refreshList,
  });

  const [loadedDetails, setLoadedDetails] = useState<Record<string, AdminContentVideoDetail>>(
    directVideoDetail ? { [directVideoDetail.video.id]: directVideoDetail } : {},
  );
  // openVideo 需要读已缓存详情，但缓存更新不应让列表回调用新引用、拖累 ContentList 的 memo。
  const loadedDetailsRef = useRef(loadedDetails);
  useEffect(() => {
    loadedDetailsRef.current = loadedDetails;
  }, [loadedDetails]);
  const [lastDisplayedDetail, setLastDisplayedDetail] = useState<AdminContentVideoDetail | null>(
    directVideoDetail ?? null,
  );
  const [detailError, setDetailError] = useState<{ videoId: string; message: string } | null>(null);
  const [detailRequestAttempt, setDetailRequestAttempt] = useState(0);
  const selectedLoadedDetail = selectedVideoId ? loadedDetails[selectedVideoId] : undefined;
  const [selectedAuthor, setSelectedAuthor] = useState<{ id: string; name: string } | null>(null);
  const [lastSelectedAuthorName, setLastSelectedAuthorName] = useState<string | null>(null);

  // A4: 深链或者 URL 中的 authorId
  // 如果当前在本地有点击选择过对应的名字，以记录的名字为准；否则从 profiles / videos 中查找，兜底为“创作者”
  const activeAuthor = useMemo(() => {
    if (!selectedAuthorId) return null;
    const authorName =
      (selectedAuthorId === selectedAuthor?.id ? selectedAuthor.name : null) ||
      lastSelectedAuthorName ||
      data.profiles.find((p) => p.id === selectedAuthorId)?.name ||
      data.videos.find((v) => v.user_id === selectedAuthorId)?.profiles?.name ||
      data.ownerNames?.[selectedAuthorId] ||
      "创作者";
    return { id: selectedAuthorId, name: authorName };
  }, [data.ownerNames, data.profiles, data.videos, lastSelectedAuthorName, selectedAuthor, selectedAuthorId]);

  const handleSelectAuthor = useCallback((id: string, name: string) => {
    // A3: 详情内点作者名：先关详情再开作者抽屉，保证任一时刻 DOM 中 Sheet 层数 ≤ 1（缺口①）
    setLastDisplayedDetail(null);
    closeVideo();
    setLastSelectedAuthorName(name);
    setSelectedAuthor({ id, name });
    selectAuthor(id);
  }, [closeVideo, selectAuthor]);

  const handleCloseAuthor = useCallback(() => {
    // A4: 关闭作者抽屉同步 URL 且后退不复活（缺口③）
    setSelectedAuthor(null);
    closeAuthor();
  }, [closeAuthor]);

  const handleViewAuthorInMainList = useCallback((authorId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("userId", authorId);
    params.delete("page");
    params.delete("authorId");
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    void loadData(view, perspective, teamId, { resetPage: true });
    setSelectedAuthor(null);
    closeAuthor();
  }, [closeAuthor, loadData, perspective, teamId, view]);

  // 换作品时清掉上一条的详情错误：放在点击入口而不是 effect 里，避免 effect 内同步 setState 触发级联渲染
  const openVideo = useCallback(
    (videoId: string) => {
      setDetailError(null);
      // 点击即开始下载详情 chunk，与下面 effect 里的详情 API 请求并行，不等脚本回来再发接口。
      preloadDetailDialog();
      const cached = loadedDetailsRef.current[videoId];
      if (cached) {
        setLastDisplayedDetail(cached);
      }
      selectVideo(videoId);
    },
    [preloadDetailDialog, selectVideo],
  );
  const handleSelectVideoId = useCallback((videoId: string | null) => {
    if (videoId) openVideo(videoId);
    else closeVideo();
  }, [closeVideo, openVideo]);
  const contentCursors = useMemo(
    () => data.cursors ?? { previous: null, next: null },
    [data.cursors],
  );

  useEffect(() => {
    if (!selectedVideoId || selectedLoadedDetail) return;
    let cancelled = false;
    void fetch(`/api/admin/content/${selectedVideoId}?view=${view}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "详情加载失败");
        return response.json() as Promise<AdminContentVideoDetail>;
      })
      .then((detail) => {
        if (!cancelled) {
          setLoadedDetails((current) => ({ ...current, [detail.video.id]: detail }));
          setLastDisplayedDetail(detail);
        }
      })
      .catch((error) => {
        if (!cancelled) setDetailError({
          videoId: selectedVideoId,
          message: error instanceof Error ? error.message : "详情加载失败",
        });
      });
    return () => { cancelled = true; };
  }, [detailRequestAttempt, selectedLoadedDetail, selectedVideoId, view]);

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
    // 抽屉已打开时切换下一条作品：在新详情请求返回前保持上一条详情挂载，原地无感替换内容，避免抽屉先收起再重弹
    const selectedDetail = selectedLoadedDetail ?? lastDisplayedDetail ?? null;
    const selectedVideo = selectedDetail?.video ?? (directVideoDetail?.video.id === selectedVideoId ? directVideoDetail.video : null);
    const selectedSnapshot = selectedDetail?.snapshot ?? null;
    // 详情已返回当前作品的真实分类，优先使用，避免入库状态未加载时丢失第四格与评级。
    // 深链回退仍限定同一个视频，避免切换作品时串用分类。
    const selectedTopicKind = selectedVideo
      ? selectedDetail?.topicKind
        ?? topicLibraryStatuses[selectedVideo.id]?.topicKind
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
          <Button type="button" size="s" variant="outline" onClick={() => {
            setLastDisplayedDetail(null);
            closeVideo();
          }}>返回列表</Button>
        </div>
      </section>
    ) : selectedVideo ? (
      <ContentDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLastDisplayedDetail(null);
            closeVideo();
          }
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        contentQuality={selectedDetail?.contentQuality ?? data.contentQualityByVideoId?.[selectedVideo.id] ?? null}
        canOperateLifecycle={permissionInfo.permissions.manage_videos === true}
        canPurge={permissionInfo.companyRole === "company_owner"}
        onLifecycleChanged={() => {
          setLastDisplayedDetail(null);
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
        evaluationStandards={selectedLoadedDetail?.evaluationStandards ?? data.evaluationStandards}
        currentIndex={videoPosition.currentIndex}
        totalCount={videoPosition.totalCount}
        switching={!selectedLoadedDetail && selectedVideo.id !== selectedVideoId}
        onStepVideo={handleStepVideo}
        onSelectAuthor={handleSelectAuthor}
        ownerNames={data.ownerNames}
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
        onPointerEnter={handleListPointerEnter}
        className="flex flex-1 flex-col scroll-mt-8"
      >
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-65" : "opacity-100"}`}>
          <ContentList
            videos={videosWithLibraryStatus}
            selectedVideoId={selectedVideoId}
            snapshots={data.snapshots}
            profiles={data.profiles}
            accountOptions={data.accountOptions}
            reviewReadiness={data.reviewReadiness}
            contentQualityByVideoId={data.contentQualityByVideoId}
            evaluationStandards={data.evaluationStandards}
            view={view}
            onViewChange={handleViewChange}
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
            cursors={contentCursors}
            availableDates={data.availableDates ?? EMPTY_DATES}
            availableCounts={data.availableCounts ?? EMPTY_COUNTS}
            onQueryChange={handleQueryChange}
            canReviewContent={permissionInfo.permissions.review_content === true}
            onSelectVideoId={handleSelectVideoId}
            onSelectAuthor={handleSelectAuthor}
            ownerNames={data.ownerNames}
          />
        </div>
      </section>
    {diagnosisDrawerNode}
    <AuthorWorksDrawer
      key={`${permissionInfo.userId}:${teamId}:${activeAuthor?.id ?? ""}`}
      author={activeAuthor}
      open={Boolean(selectedAuthorId)}
      onClose={handleCloseAuthor}
      evaluationStandards={data.evaluationStandards}
      canManageVideos={permissionInfo.permissions.manage_videos === true}
      onViewInMainList={handleViewAuthorInMainList}
      canReviewContent={permissionInfo.permissions.review_content === true}
      canViewCollaboration={canAccessAdminPath("/admin/collaboration", permissionInfo.role, permissionInfo.permissions)}
      onWorksChanged={() => { setLoadedDetails({}); void loadData(view, perspective, teamId, { fresh: true }); }}
    />
  </>
  );
}
