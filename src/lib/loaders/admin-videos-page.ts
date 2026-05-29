import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserPermissionInfo } from "@/lib/permissions";
import { buildVideoAssetRecord } from "@/lib/video-asset-library";
import type { Profile, Video, VideoAssetLibraryRecord, VideoMetricsSnapshot, VideoTag } from "@/types";

type LoaderSupabase = SupabaseClient;
type ScopeInput = Awaited<ReturnType<typeof buildDataAccessScope>>;

type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
  profiles: { name: string };
};

type RawVideoRow = Omit<VideoRow, "accounts" | "profiles"> & {
  accounts: { name: string | null; profile_id?: string | null } | Array<{ name: string | null; profile_id?: string | null }> | null;
  profiles: { name: string | null } | Array<{ name: string | null }> | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };
type LoadMode = "initial" | "full";

export const ADMIN_VIDEOS_INITIAL_LIMIT = 30;
const ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT = 60;
const ADMIN_VIDEOS_FIRST_SCREEN_RPC = "admin_videos_first_screen";
const VIDEO_ASSET_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, asset_level, asset_note, asset_reviewed_by, asset_reviewed_at, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";
const VIDEO_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio";

export interface AdminVideosPageData {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  videoTags: VideoTag[];
  assetLibrary: Record<string, VideoAssetLibraryRecord>;
  summary: {
    totalVideos: number;
    taggedVideos: number;
    snapshotCount: number;
    abnormalCount: number;
    pendingCount: number;
  };
  assetSummary: {
    readyCount: number;
    pendingLibraryCount: number;
    completeCount: number;
    partialCount: number;
    missingCount: number;
    gradedCount: number;
  };
  isPartial?: boolean;
}

function limitInitialVideos<T>(rows: T[], mode: LoadMode) {
  return mode === "initial" ? rows.slice(0, ADMIN_VIDEOS_INITIAL_LIMIT) : rows;
}

function readJoinedName(value: RawVideoRow["accounts"] | RawVideoRow["profiles"], fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? fallback;
}

function readJoinedProfileId(value: RawVideoRow["accounts"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.profile_id ?? null;
}

function normalizeVideoRows(rows: RawVideoRow[]): VideoRow[] {
  return rows.map((row) => ({
    ...row,
    accounts: {
      name: readJoinedName(row.accounts, "未命名账号"),
      profile_id: readJoinedProfileId(row.accounts),
    },
    profiles: { name: readJoinedName(row.profiles, "未命名成员") },
  }));
}

export async function loadAdminVideosPageData({
  supabase,
  view = "pending",
  perspective = "company",
  teamId = null,
  mode = "full",
  permissionInfo,
  scope,
}: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  mode?: LoadMode;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}): Promise<AdminVideosPageData> {
  const resolvedScope = scope
    ?? (permissionInfo
      ? await buildDataAccessScope(createAdminClient(), permissionInfo.userId, {
          perspective,
          teamId,
          profile: {
            id: permissionInfo.userId,
            role: permissionInfo.role,
            permissions: permissionInfo.permissions,
            access_level: permissionInfo.accessLevel,
            team_id: permissionInfo.teamId,
            group_id: permissionInfo.groupId,
            led_group_ids: permissionInfo.ledGroupIds,
            business_role: permissionInfo.businessRole,
          },
        })
      : null);
  let videosQuery = supabase
    .from("videos")
    .select(VIDEO_ASSET_SELECT)
    .order("published_at", { ascending: false });
  if (mode === "initial") {
    videosQuery = videosQuery.range(0, ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT - 1);
  }

  const [{ data: videos }, { data: profiles }, { data: accounts }] = await Promise.all([
    videosQuery,
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name, profile_id").order("name", { ascending: true }),
  ]);

  const normalizedRows = normalizeVideoRows((videos ?? []) as unknown as RawVideoRow[]);
  const normalizedVideos = resolvedScope
    ? filterRowsByDataScope(resolvedScope, normalizedRows, (video) => video.accounts?.profile_id ?? video.user_id)
    : normalizedRows;
  const scopedVideoIdSet = new Set(normalizedVideos.map((video) => video.id));
  const scopedVideoIds = Array.from(scopedVideoIdSet);
  const { data: tagIds } = scopedVideoIds.length > 0
    ? await supabase.from("video_tags").select("video_id").in("video_id", scopedVideoIds)
    : { data: [] };
  const visibleProfileIds = new Set(resolvedScope?.visibleUserIds ?? normalizedVideos.map((video) => video.accounts?.profile_id ?? video.user_id));
  const taggedVideoIds = new Set(
    (tagIds ?? [])
      .map((tag) => tag.video_id as string)
      .filter((videoId) => scopedVideoIdSet.has(videoId)),
  );
  const pendingVideos = normalizedVideos.filter(
    (video) => !taggedVideoIds.has(video.id) || video.anomaly_status !== "正常",
  );
  const visibleVideos =
    view === "pending"
      ? pendingVideos
      : normalizedVideos;
  const initialVisibleVideos = limitInitialVideos(visibleVideos, mode);
  const visibleVideoIds = initialVisibleVideos.map((video) => video.id);
  const [
    { data: snapshotFlags },
    { data: segmentRows },
  ] =
    scopedVideoIds.length > 0
      ? await Promise.all([
          supabase.from("video_metrics_snapshots").select("video_id").eq("snapshot_type", "24h").in("video_id", scopedVideoIds),
          supabase.from("video_content_segments").select("video_id").in("video_id", scopedVideoIds),
        ])
      : [{ data: [] }, { data: [] }];
  const [{ data: snapshots }, { data: videoTags }] =
    visibleVideoIds.length > 0
      ? await Promise.all([
          supabase.from("video_metrics_snapshots").select(VIDEO_SNAPSHOT_SELECT).in("video_id", visibleVideoIds),
          supabase.from("video_tags").select("*").in("video_id", visibleVideoIds),
        ])
      : [{ data: [] }, { data: [] }];
  const normalizedTags = (videoTags ?? []) as VideoTag[];
  const snapshot24hVideoIds = new Set((snapshotFlags ?? []).map((row) => row.video_id as string));
  const segmentCountMap = new Map<string, number>();
  for (const row of segmentRows ?? []) {
    const videoId = row.video_id as string | null;
    if (!videoId) continue;
    segmentCountMap.set(videoId, (segmentCountMap.get(videoId) ?? 0) + 1);
  }

  const assetSummaryRecords = normalizedVideos.map((video) =>
    buildVideoAssetRecord({
      videoId: video.id,
      videoTitle: video.video_title,
      content: video.content,
      hasSnapshot24h: snapshot24hVideoIds.has(video.id),
      tagCount: taggedVideoIds.has(video.id) ? 1 : 0,
      segmentCount: segmentCountMap.get(video.id) ?? 0,
      assetLevel: video.asset_level ?? null,
      assetNote: video.asset_note ?? null,
      assetReviewedAt: video.asset_reviewed_at ?? null,
      assetReviewedBy: video.asset_reviewed_by ?? null,
    }),
  );
  const assetLibrary = Object.fromEntries(
    initialVisibleVideos.map((video) => [
      video.id,
      buildVideoAssetRecord({
        videoId: video.id,
        videoTitle: video.video_title,
        content: video.content,
        hasSnapshot24h: snapshot24hVideoIds.has(video.id),
        tagCount: normalizedTags.filter((tag) => tag.video_id === video.id).length,
        segmentCount: segmentCountMap.get(video.id) ?? 0,
        assetLevel: video.asset_level ?? null,
        assetNote: video.asset_note ?? null,
        assetReviewedAt: video.asset_reviewed_at ?? null,
        assetReviewedBy: video.asset_reviewed_by ?? null,
      }),
    ]),
  ) as Record<string, VideoAssetLibraryRecord>;

  return {
    videos: initialVisibleVideos,
    snapshots: (snapshots ?? []) as VideoMetricsSnapshot[],
    profiles: (profiles ?? [])
      .filter((profile) => visibleProfileIds.has(profile.id))
      .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? [])
      .filter((account) => visibleProfileIds.has(account.profile_id))
      .map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    videoTags: normalizedTags,
    assetLibrary,
    summary: {
      totalVideos: normalizedVideos.length,
      taggedVideos: taggedVideoIds.size,
      snapshotCount: snapshot24hVideoIds.size,
      abnormalCount: normalizedVideos.filter((video) => video.anomaly_status !== "正常").length,
      pendingCount: pendingVideos.length,
    },
    assetSummary: {
      readyCount: assetSummaryRecords.filter((record) => record.library_status === "ready").length,
      pendingLibraryCount: assetSummaryRecords.filter((record) => record.library_status === "pending").length,
      completeCount: assetSummaryRecords.filter((record) => record.completeness_status === "complete").length,
      partialCount: assetSummaryRecords.filter((record) => record.completeness_status === "partial").length,
      missingCount: assetSummaryRecords.filter((record) => record.completeness_status === "missing").length,
      gradedCount: assetSummaryRecords.filter((record) => record.asset_level !== null).length,
    },
    isPartial: mode === "initial" && visibleVideos.length > initialVisibleVideos.length,
  };
}

export async function loadAdminVideosInitialData(args: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}) {
  if (!args.scope) {
    return loadAdminVideosPageData({
      ...args,
      mode: "initial",
    });
  }

  const { data, error } = await args.supabase.rpc(ADMIN_VIDEOS_FIRST_SCREEN_RPC, {
    p_visible_user_ids: args.scope.visibleUserIds,
    p_view: args.view ?? "pending",
    p_limit_rows: ADMIN_VIDEOS_INITIAL_LIMIT,
    p_candidate_limit: ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT,
  });

  if (error || !data || typeof data !== "object") {
    return loadAdminVideosPageData({
      ...args,
      mode: "initial",
    });
  }

  return data as AdminVideosPageData;
}

export async function loadAdminVideosFullData(args: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}) {
  return loadAdminVideosPageData({
    ...args,
    mode: "full",
  });
}

export const __internal = {
  ADMIN_VIDEOS_INITIAL_LIMIT,
  ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT,
  ADMIN_VIDEOS_FIRST_SCREEN_RPC,
  VIDEO_ASSET_SELECT,
  VIDEO_SNAPSHOT_SELECT,
  limitInitialVideos,
  normalizeVideoRows,
};
