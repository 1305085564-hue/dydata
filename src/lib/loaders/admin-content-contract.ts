import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { type ContentListQuery } from "@/lib/content/domain/content-list-query";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { type EvaluationStandards } from "@/lib/evaluation-standards";
import type { UserPermissionInfo } from "@/lib/permissions";
import { type VideoTopicKind,type VideoTopicLibraryStatusInfo } from "@/lib/topics/library";
import type { ContentReviewReadiness,Profile,Video,VideoMetricsSnapshot } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";


export type LoaderSupabase = SupabaseClient;

export type ScopeInput = Awaited<ReturnType<typeof buildDataAccessScope>>;

export type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
  profiles: { name: string };
};

export type RawVideoRow = Omit<VideoRow, "accounts" | "profiles"> & {
  accounts: { name: string | null; profile_id?: string | null } | Array<{ name: string | null; profile_id?: string | null }> | null;
  profiles: { name: string | null } | Array<{ name: string | null }> | null;
};

export type FilterOption = Pick<Profile, "id" | "name">;

export type SegmentRow = { video_id: string };

export const CONTENT_VIDEO_SELECT_BASE =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, review_status, reviewed_at, lifecycle_state, trashed_at, trashed_by, purged_at, purged_by, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";

export const CONTENT_VIDEO_SELECT = `settlement_excluded, settlement_excluded_reason, ${CONTENT_VIDEO_SELECT_BASE}`;

export const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url";

export const PREVIOUS_VIDEO_SELECT = "id, account_id, published_at";

export const PREVIOUS_SNAPSHOT_SELECT = "video_id, play_count, captured_at";

export const FULL_QUERY_BATCH_SIZE = 200;

/** 单请求内并发查询上限：批次查询与按账号边界查询共用，避免上千条视频时打满连接池 */
export const QUERY_CONCURRENCY_LIMIT = 6;

export const PLAY_CHANGE_SURGE_DELTA_MIN = 5_000;

export interface AdminContentPageData {
  evaluationStandards?: EvaluationStandards;
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  ownerNames?: Record<string, string>;
  accountOptions?: Array<{ id: string; name: string }>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  /** 列表范围内每条视频的统一内容质量结果；Record 可直接随 JSON 刷新传输。 */
  contentQualityByVideoId: Record<string, WorkContentQuality>;
  /**
   * 当前页视频的选题库状态，与 /api/admin/content/topic-library-status 同口径。
   * 仅在调用方显式要求且有「作品复盘只读」权限时下发；查询失败时保持 undefined，
   * 前端会回退到原状态接口，列表本身不受影响。
   */
  topicLibraryStatuses?: Record<string, VideoTopicLibraryStatusInfo>;
  summary: {
    totalVideos: number;
    /** 当前日期窗口内未应用收窄筛选（评级/账号/成员/播放/异常/关键词等）时的真实总基数。 */
    unfilteredTotalVideos?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    anomalyCount?: number;
    pageStartIndex?: number;
    hasPreviousPage?: boolean;
    hasNextPage?: boolean;
    directReviewVideoId?: string | null;
  };
  /** 当前筛选范围内（不含日期过滤）有作品的日期，降序，供日期翻页器使用 */
  availableDates?: string[];
  availableCounts?: Array<{ d: string; c: number }>;
  diagnostics?: {
    rowsRead: number;
    snapshotRowsRead: number;
    returnedRows: number;
    rpcDurationMs?: number;
    evaluationStandardsVersion?: number;
  };
  cursors?: { previous: string | null; next: string | null };
}

export interface AdminContentVideoDetail {
  evaluationStandards?: EvaluationStandards;
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  /** 与列表同源的统一内容质量结果。旧详情响应缺字段时按 null 兼容。 */
  contentQuality?: WorkContentQuality | null;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind: VideoTopicKind;
}

export type AdminContentListArgs = {
  supabase: LoaderSupabase;
  view?: "all" | "trash";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
  query?: ContentListQuery;
  /**
   * 是否随当前页视频下发选题库状态。只有数据复盘列表页（SSR 与 GET 列表接口）需要；
   * 作者作品抽屉等批量复用列表的分页调用不打开，避免每页多算一遍。
   */
  includeTopicLibraryStatuses?: boolean;
};

export type AdminContentRpcPage = {
  cursorValid?: boolean;
  videos?: RawVideoRow[];
  snapshots?: VideoMetricsSnapshot[];
  summary?: AdminContentPageData["summary"];
  diagnostics?: AdminContentPageData["diagnostics"];
  accountOptions?: Array<{ id: string; name: string }>;
  availableDates?: string[]; availableCounts?: Array<{ d: string; c: number }>;
  cursors?: {
    previous?: { sortValue: number | string | null; id: string; direction: "before" | "after" } | null;
    next?: { sortValue: number | string | null; id: string; direction: "before" | "after" } | null;
  };
};
