"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const refreshList = useCallback(
    () => loadData(view, perspective, teamId, { background: true }),
    [loadData, perspective, teamId, view],
  );
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
        className="flex flex-1 flex-col scroll-mt-8"
      >
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-65 pointer-events-none" : "opacity-100"}`}>
          <ContentList
            videos={videosWithLibraryStatus}
            snapshots={data.snapshots}
            profiles={data.profiles}
            reviewReadiness={data.reviewReadiness}
            contentQualityByVideoId={data.contentQualityByVideoId}
            view={view}
            onViewChange={(nextView) => void loadData(nextView, perspective, teamId)}
            perspective={perspective}
            onPerspectiveChange={switchPerspective}
            teamId={teamId}
            onTeamChange={switchTeam}
            teams={teams}
            canSwitchPerspective={canSwitchPerspective}
            canManageVideos={permissionInfo.permissions.manage_videos === true}
            totalVideosCount={data.summary.totalVideos}
            canReviewContent={permissionInfo.permissions.review_content === true}
            onDirectReview={handleDirectReview}
            onSelectVideoId={(videoId) => {
              if (videoId) selectVideo(videoId);
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
          这里专为管理者打造，旨在 30 秒内快速抓住一条视频的核心问题并完成闭环：
        </p>
        <ol className="space-y-2 text-[13px] text-[#1F1E1D]">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-status-danger/10 text-status-danger font-normal text-[12px]">
              1
            </span>
            <span>
              <strong>先看异常与指标</strong>：用列表筛选定位作品，打开抽屉查看完整指标和原视频。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-[#D97757]/10 text-[#D97757] font-normal text-[12px]">
              2
            </span>
            <span>
              <strong>截图对照</strong>：结合流量曲线和留存脱落截图，看观众在哪个句段离开。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-status-info/10 text-status-info font-normal text-[12px]">
              3
            </span>
            <span>
              <strong>闭环处理</strong>：查看指标、复制文案、进入选题库或处理回收站。
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
