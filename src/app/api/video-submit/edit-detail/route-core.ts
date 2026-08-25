import { buildVideoSubmissionEditDetail, type VideoSubmissionEditDetailSource } from "../edit-detail";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export const EDIT_DETAIL_VIDEO_SELECT =
  "id, account_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, script_author_user_id, video_editor_user_id, operator_user_id";
export const EDIT_DETAIL_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, follower_convert, avg_play_duration, bounce_rate_2s, completion_rate_5s, completion_rate, screenshot_urls, curve_screenshot_url, retention_screenshot_url, vs_previous";
export const EDIT_DETAIL_REPORT_SELECT = "id, user_id, account_id, report_date";
export const EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT = "id, name, membership_status";

type QueryOutcome<T> = { data: T[] | null; error: { message: string } | null };
type SingleOutcome<T> = { data: T | null; error: { message: string } | null };

export interface EditDetailPageDbAdapter {
  getAccountById(accountId: string): Promise<SingleOutcome<{ id: string; profile_id: string }>>;
  listReportsByAccountAndDate(accountId: string, bizDate: string): Promise<QueryOutcome<{ id: string; user_id: string; account_id: string; report_date: string }>>;
  listActiveVideosByAccount(accountId: string): Promise<QueryOutcome<Record<string, unknown>>>;
  list24hSnapshotsByVideoId(videoId: string): Promise<QueryOutcome<Record<string, unknown>>>;
  listTagsByVideoId(videoId: string): Promise<QueryOutcome<{ tag_dimension: string | null; tag_value: string | null }>>;
  listUsageRecordsByReportAndUser(reportId: string, userId: string): Promise<QueryOutcome<{ id: string; script_text: string | null; script_format: string | null }>>;
  /** 只查询原记录中精确的三个责任人 ID；由调用方在完成归属校验后提供 */
  listAssigneeProfilesByIds(userIds: string[]): Promise<QueryOutcome<{ id: string; name: string | null; membership_status: string | null }>>;
}

export interface EditDetailPageInput {
  accountId: string;
  bizDate: string;
  userId: string | null;
}

export type EditDetailPageResult = { status: number; body: Record<string, unknown> };

function isBizDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function videoMatchesBizDate(video: { published_at: string | null; uploaded_at: string | null }, bizDate: string) {
  return [video.published_at, video.uploaded_at]
    .some((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && formatShanghaiDateOnly(new Date(value)) === bizDate);
}

/**
 * GET 编辑详情的完整读模型：登录、账号归属、日报唯一、视频唯一且匹配日期、
 * 快照唯一、DTO 完整性，以及历史责任人档案（仅查原记录精确的三个 ID）。
 */
export async function loadVideoSubmissionEditDetailPage(
  input: EditDetailPageInput,
  db: EditDetailPageDbAdapter,
): Promise<EditDetailPageResult> {
  if (!isBizDate(input.bizDate)) {
    return { status: 400, body: { error: "account_id 或 biz_date 格式不正确" } };
  }

  const userId = input.userId;
  if (!userId) {
    return { status: 401, body: { error: "未登录" } };
  }

  const { data: account, error: accountError } = await db.getAccountById(input.accountId);
  if (accountError) return { status: 500, body: { error: "读取账号失败" } };
  if (!account || account.profile_id !== userId) {
    return { status: 403, body: { error: "账号不存在或无权限读取编辑详情" } };
  }

  const { data: reports, error: reportError } = await db.listReportsByAccountAndDate(input.accountId, input.bizDate);
  if (reportError) return { status: 500, body: { error: "读取原日报失败" } };
  if (!reports?.length) return { status: 404, body: { error: "该账号该日期没有可编辑的日报" } };
  if (reports.length > 1) return { status: 409, body: { error: "该账号该日期存在多条日报，无法安全编辑" } };
  const dailyReport = reports[0];
  if (dailyReport.user_id !== userId) {
    return { status: 404, body: { error: "该账号该日期没有可编辑的日报" } };
  }

  const { data: videos, error: videoError } = await db.listActiveVideosByAccount(input.accountId);
  if (videoError) return { status: 500, body: { error: "读取原视频失败" } };
  const matchedVideos = (videos ?? []).filter((video) => videoMatchesBizDate(video as { published_at: string | null; uploaded_at: string | null }, input.bizDate));
  if (!matchedVideos.length) return { status: 404, body: { error: "该账号该日期没有可编辑的原视频" } };
  if (matchedVideos.length > 1) return { status: 409, body: { error: "该账号该日期存在多条视频，无法安全编辑" } };
  const video = matchedVideos[0] as VideoSubmissionEditDetailSource["video"];

  // 归属校验完成后，只按原记录中精确的三个责任人 ID 查询展示档案
  const assigneeIds = [...new Set([
    video.script_author_user_id,
    video.video_editor_user_id,
    video.operator_user_id,
  ].filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];

  const [snapshotsResult, tagsResult, profilesResult] = await Promise.all([
    db.list24hSnapshotsByVideoId(video.id),
    db.listTagsByVideoId(video.id),
    assigneeIds.length ? db.listAssigneeProfilesByIds(assigneeIds) : Promise.resolve({ data: [], error: null } as QueryOutcome<{ id: string; name: string | null; membership_status: string | null }>),
  ]);

  if (snapshotsResult.error) return { status: 500, body: { error: "读取原24h快照失败" } };
  const snapshots = snapshotsResult.data ?? [];
  if (!snapshots.length) {
    return { status: 422, body: { error: "原视频缺少24h快照，已停止编辑以避免覆盖" } };
  }
  if (snapshots.length > 1) {
    return { status: 409, body: { error: "原视频存在多条24h快照，无法安全编辑" } };
  }
  if (tagsResult.error) return { status: 500, body: { error: "读取原标签失败" } };

  const usageRecords = await db.listUsageRecordsByReportAndUser(dailyReport.id, userId);
  if (usageRecords.error) return { status: 500, body: { error: "读取原导粉话术失败" } };
  if ((usageRecords.data?.length ?? 0) > 1) {
    return { status: 409, body: { error: "原日报存在多条导粉话术使用记录，无法安全编辑" } };
  }

  if (profilesResult.error) {
    return { status: 500, body: { error: "读取历史责任人失败" } };
  }

  const detailResult = buildVideoSubmissionEditDetail({
    video,
    snapshot: snapshots[0],
    dailyReport,
    tags: tagsResult.data ?? [],
    usageRecord: usageRecords.data?.[0] ?? null,
    assigneeProfiles: (profilesResult.data ?? []).map((profile) => ({
      userId: profile.id,
      name: profile.name,
      displayName: profile.name,
      membershipStatus: profile.membership_status,
    })),
    bizDate: input.bizDate,
  } as VideoSubmissionEditDetailSource);
  if (!detailResult.ok) return { status: 422, body: { error: detailResult.error } };

  return { status: 200, body: { detail: detailResult.detail } };
}
