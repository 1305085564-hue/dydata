import {
  buildUnboundDailyReportDetail,
  buildVideoSubmissionEditDetail,
  type VideoSubmissionEditDetailSource,
} from "../edit-detail";

export const EDIT_DETAIL_VIDEO_SELECT =
  "id, account_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, script_author_user_id, video_editor_user_id, operator_user_id";
export const EDIT_DETAIL_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, follower_convert, avg_play_duration, bounce_rate_2s, completion_rate_5s, completion_rate, screenshot_urls, curve_screenshot_url, retention_screenshot_url, vs_previous";
export const EDIT_DETAIL_REPORT_SELECT =
  "id, user_id, account_id, report_date, video_id, data_source, script_author_user_id, video_editor_user_id, operator_user_id";
export const EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT = "id, name, membership_status";
export const EDIT_DETAIL_USAGE_RECORD_SELECT =
  "id, case:violation_cases!script_usage_records_case_id_fkey(script_text, script_format)";

type QueryOutcome<T> = { data: T[] | null; error: { message: string } | null };
type SingleOutcome<T> = { data: T | null; error: { message: string } | null };

type EditDetailUsageRecord = {
  id: string;
  script_text: string | null;
  script_format: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function decodeEditDetailUsageRecordRows(
  rows: unknown,
): QueryOutcome<EditDetailUsageRecord> {
  if (!Array.isArray(rows)) {
    return { data: null, error: { message: "导粉话术查询结果格式错误" } };
  }

  const decoded: EditDetailUsageRecord[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || !row.id.trim()) {
      return { data: null, error: { message: "导粉话术使用记录格式错误" } };
    }

    const joinedCase = Array.isArray(row.case) ? row.case[0] : row.case;
    if (!isRecord(joinedCase)) {
      return { data: null, error: { message: "导粉话术关联案例缺失" } };
    }
    if (typeof joinedCase.script_text !== "string" || typeof joinedCase.script_format !== "string") {
      return { data: null, error: { message: "导粉话术关联案例格式错误" } };
    }

    decoded.push({
      id: row.id,
      script_text: joinedCase.script_text,
      script_format: joinedCase.script_format,
    });
  }

  return { data: decoded, error: null };
}

export interface EditDetailPageDbAdapter {
  getAccountById(accountId: string): Promise<SingleOutcome<{ id: string; profile_id: string }>>;
  listReportsByAccountAndDate(accountId: string, bizDate: string): Promise<QueryOutcome<{
    id: string;
    user_id: string;
    account_id: string;
    report_date: string;
    video_id?: string | null;
    data_source?: unknown;
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
  }>>;
  loadActiveVideoById(videoId: string): Promise<SingleOutcome<Record<string, unknown>>>;
  list24hSnapshotsByVideoId(videoId: string): Promise<QueryOutcome<Record<string, unknown>>>;
  listTagsByVideoId(videoId: string): Promise<QueryOutcome<{ tag_dimension: string | null; tag_value: string | null }>>;
  listUsageRecordsByReportAndUser(reportId: string, userId: string): Promise<QueryOutcome<EditDetailUsageRecord>>;
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

function uniqueAssigneeIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
}

async function loadAssigneeProfiles(
  db: EditDetailPageDbAdapter,
  ids: string[],
): Promise<QueryOutcome<{ id: string; name: string | null; membership_status: string | null }>> {
  if (!ids.length) return { data: [], error: null };
  return db.listAssigneeProfilesByIds(ids);
}

/**
 * GET 编辑详情的完整读模型：登录、账号归属、日报唯一，再按日报是否绑定视频分两支。
 *
 * - 日报绑定了 active 视频：返回视频侧完整详情（现状不变）。
 * - 日报没有绑定视频（生产上 461 条，属合法状态）：只返回日报侧详情，
 *   既不按账号+日期猜视频，也不返回视频专属字段。调用方自行决定呈现方式。
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

  if (!(typeof dailyReport.video_id === "string" && dailyReport.video_id.trim())) {
    const profilesResult = await loadAssigneeProfiles(db, uniqueAssigneeIds([
      dailyReport.script_author_user_id,
      dailyReport.video_editor_user_id,
      dailyReport.operator_user_id,
    ]));
    if (profilesResult.error) {
      return { status: 500, body: { error: "读取历史责任人失败" } };
    }

    const unboundResult = buildUnboundDailyReportDetail({
      dailyReport,
      assigneeProfiles: (profilesResult.data ?? []).map((profile) => ({
        userId: profile.id,
        name: profile.name,
        displayName: profile.name,
        membershipStatus: profile.membership_status,
      })),
      bizDate: input.bizDate,
    });
    if (!unboundResult.ok) return { status: 422, body: { error: unboundResult.error } };

    return { status: 200, body: { detail: null, unboundReport: unboundResult.detail } };
  }

  const { data: boundVideo, error: boundVideoError } = await db.loadActiveVideoById(dailyReport.video_id);
  if (boundVideoError) return { status: 500, body: { error: "读取原视频失败" } };
  if (!boundVideo || boundVideo.account_id !== input.accountId) {
    return { status: 404, body: { error: "该账号该日期没有可编辑的原视频" } };
  }
  const video = boundVideo as VideoSubmissionEditDetailSource["video"];

  // 归属校验完成后，只按原记录中精确的三个责任人 ID 查询展示档案
  const assigneeIds = uniqueAssigneeIds([
    video.script_author_user_id,
    video.video_editor_user_id,
    video.operator_user_id,
  ]);

  const [snapshotsResult, tagsResult, profilesResult] = await Promise.all([
    db.list24hSnapshotsByVideoId(video.id),
    db.listTagsByVideoId(video.id),
    loadAssigneeProfiles(db, assigneeIds),
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
