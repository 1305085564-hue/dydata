import type { ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import type { VideoRow } from "@/lib/review-queue";
import { isRetiredVideoAnomalyStatus, resolveVideoStatusLabel } from "@/lib/video-anomaly";

export interface ContentListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: Array<{ id: string; name: string }>;
  accountOptions?: Array<{ id: string; name: string }>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  contentQualityByVideoId?: Record<string, WorkContentQuality>;
  view?: "all" | "trash";
  onViewChange?: (view: "all" | "trash") => void;
  perspective?: AdminDataPerspective;
  onPerspectiveChange?: (perspective: AdminDataPerspective) => void;
  teamId?: string | null;
  onTeamChange?: (teamId: string | null) => void;
  teams?: TeamOption[];
  canSwitchPerspective?: boolean;
  canManageVideos?: boolean;
  totalVideosCount?: number;
  totalPages?: number;
  serverPage?: number;
  serverPageSize?: number;
  serverPaginated?: boolean;
  cursors?: { previous: string | null; next: string | null };
  /** 当前筛选范围内有作品的日期（降序），供日期翻页器使用 */
  availableDates?: string[];
  canReviewContent?: boolean;
  onDirectReview?: () => void;
  /** 视图切换（全部↔归档）等整表取数是否在进行中：用于给出「正在加载X…」反馈，
   *  避免长耗时操作期间用户以为点了没反应（2026-10-11 审计 H2）。 */
  isViewLoading?: boolean;
  onSelectVideoId: (id: string | null) => void;
  onQueryChange?: () => void;
}

export type SortField =
  | "published_at"
  | "overall_grade"
  | "core_metric"
  | "play_count"
  | "follower_gain"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "interaction_rate"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "avg_play_duration"
  | "completion_rate";

/** 各列「第一次点表头」应该先看到什么，按指标语义定死，不再一律降序：
 *  - 越高越好的比率/时长（5s 完播、完播、互动率、均播时长、核心指标）：默认升序 → 最差在前，正是复盘要找的
 *  - 越高越差的比率（2s 跳出）：默认降序 → 最差在前
 *  - 体量类计数与时间（播放量、点赞…、发布时间、评级）：默认降序 → 最大/最新/最优秀在前（通用预期）
 *  这样同一套 UI 里「降序」不再有时代表最差、有时代表最好。 */
export const DEFAULT_SORT_DIR: Record<SortField, "asc" | "desc"> = {
  published_at: "desc",
  overall_grade: "desc",
  core_metric: "asc",
  play_count: "desc",
  follower_gain: "desc",
  likes: "desc",
  comments: "desc",
  shares: "desc",
  favorites: "desc",
  interaction_rate: "asc",
  bounce_rate_2s: "desc",
  completion_rate_5s: "asc",
  avg_play_duration: "asc",
  completion_rate: "asc",
};

export const DEFAULT_PAGE_SIZE = 20;

export function getStatusDot(video: VideoRow) {
  const status = video.anomaly_status as string;
  // 标签唯一来源：提醒条 tooltip 与本列徽标共用同一映射，避免同一视频两处两个名字
  const label = resolveVideoStatusLabel({ anomalyStatus: video.anomaly_status });
  if (status === "deleted" || status === "limited" || status === "删稿" || status === "限流") {
    return {
      variant: "danger" as const,
      label,
    };
  }
  if (status === "abnormal" || status === "异常" || isRetiredVideoAnomalyStatus(status)) {
    return {
      variant: "warning" as const,
      label,
    };
  }
  // 「正常」静默化（2026-10-14）：中性灰退居基线背景，把醒目色留给真正的异常作品
  if (status === "normal" || status === "正常") {
    return {
      variant: "neutral" as const,
      label,
    };
  }
  if (status === "pending" || status === "未满24h") {
    return {
      variant: "neutral" as const,
      label,
    };
  }
  return {
    variant: "neutral" as const,
    label,
  };
}
