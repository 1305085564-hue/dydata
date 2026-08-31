import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { resolveSubmissionVideoWriteMode } from "./submission-video-lifecycle";

export const EDIT_BINDING_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, topic_id, script_author_user_id, video_editor_user_id, operator_user_id, lifecycle_state, created_at";

export const EDIT_BINDING_REPORT_SELECT =
  "id, user_id, account_id, script_author_user_id, video_editor_user_id, operator_user_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at";

export const EDIT_BINDING_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url, captured_at";

export type EditBindingVideoRow = {
  id: string;
  account_id: string;
  user_id: string;
  published_at: string | null;
  uploaded_at: string | null;
  lifecycle_state: string | null;
  script_author_user_id: string | null;
  video_editor_user_id: string | null;
  operator_user_id: string | null;
} & Record<string, unknown>;

export type EditBindingReportRow = { id: string; user_id: string; account_id: string; report_date: string } & Record<string, unknown>;

export type EditBindingSnapshotRow = {
  id: string;
  video_id: string;
  snapshot_type: string;
} & Record<string, unknown>;

type QueryOutcome<T> = { data: T[] | null; error: { message: string } | null };

export interface EditBindingDbAdapter {
  loadVideoById(videoId: string): Promise<QueryOutcome<EditBindingVideoRow>>;
  loadDailyReportsByAccountAndDate(accountId: string, bizDate: string): Promise<QueryOutcome<EditBindingReportRow>>;
  load24hSnapshotsByVideoId(videoId: string): Promise<QueryOutcome<EditBindingSnapshotRow>>;
}

export interface EditBindingInput {
  userId: string;
  accountId: string;
  bizDate: string;
  videoId: string;
}

export type EditBindingFailure = { ok: false; status: 404 | 409 | 422 | 500; error: string };
export type EditBindingSuccess = {
  ok: true;
  video: EditBindingVideoRow;
  dailyReport: EditBindingReportRow;
  snapshot24h: EditBindingSnapshotRow;
};
export type EditBindingResult = EditBindingFailure | EditBindingSuccess;

export function editVideoMatchesBizDate(
  video: Pick<EditBindingVideoRow, "published_at" | "uploaded_at">,
  bizDate: string,
) {
  return [video.published_at, video.uploaded_at].some(
    (value) =>
      typeof value === "string" &&
      !Number.isNaN(Date.parse(value)) &&
      formatShanghaiDateOnly(new Date(value)) === bizDate,
  );
}

/**
 * 编辑 POST 的独立安全边界：在任何写入发生前重新核对
 * 原视频归属、账号一致、业务日期一致、原日报与原 24h 快照恰好各一条。
 */
export async function validateEditSubmissionBinding(
  input: EditBindingInput,
  adapter: EditBindingDbAdapter,
): Promise<EditBindingResult> {
  const { data: videos, error: videoError } = await adapter.loadVideoById(input.videoId);
  if (videoError) return { ok: false, status: 500, error: videoError.message };

  // 其他用户的视频统一返回 404，不泄露记录是否存在
  if (!videos?.length || videos[0].user_id !== input.userId) {
    return { ok: false, status: 404, error: "原视频不存在或无权限编辑" };
  }
  const video = videos[0];

  if (resolveSubmissionVideoWriteMode(video.lifecycle_state ?? null) === "insert") {
    return { ok: false, status: 409, error: "视频记录已永久删除，请修改内容后重新提交" };
  }
  if (video.account_id !== input.accountId) {
    return { ok: false, status: 409, error: "编辑视频与提交账号不一致" };
  }
  if (!editVideoMatchesBizDate(video, input.bizDate)) {
    return { ok: false, status: 409, error: "原视频不属于该业务日期，已停止编辑以避免跨日期覆盖" };
  }

  const { data: reports, error: reportError } = await adapter.loadDailyReportsByAccountAndDate(input.accountId, input.bizDate);
  if (reportError) return { ok: false, status: 500, error: reportError.message };
  if (!reports?.length) {
    return { ok: false, status: 404, error: "该账号该日期没有可编辑的日报" };
  }
  if (reports.length > 1) {
    return { ok: false, status: 409, error: "该账号该日期存在多条日报，无法安全编辑" };
  }
  if (reports[0].user_id !== input.userId) {
    return { ok: false, status: 404, error: "该账号该日期没有可编辑的日报" };
  }

  const { data: snapshots, error: snapshotError } = await adapter.load24hSnapshotsByVideoId(input.videoId);
  if (snapshotError) return { ok: false, status: 500, error: snapshotError.message };
  if (!snapshots?.length) {
    return { ok: false, status: 422, error: "原视频缺少24h快照，已停止编辑以避免覆盖历史数据" };
  }
  if (snapshots.length > 1) {
    return { ok: false, status: 409, error: "原视频存在多条24h快照，无法安全编辑" };
  }

  return { ok: true, video, dailyReport: reports[0], snapshot24h: snapshots[0] };
}

/**
 * 编辑模式由服务端保留数据库中不可编辑指标的原值：
 * follower_loss、homepage_visits、fan_play_ratio、cover_click_rate、avg_play_ratio。
 * 新建模式继续使用调用方默认口径。
 */
const PRESERVED_SNAPSHOT_METRIC_FIELDS = [
  "follower_loss",
  "homepage_visits",
  "fan_play_ratio",
  "cover_click_rate",
  "avg_play_ratio",
] as const;

export function mergePreservedEditSnapshotFields<M extends Record<string, unknown>, E extends Record<string, unknown>>(
  mode: string,
  payload: M,
  existingSnapshot: E | null,
): M {
  if (mode !== "edit" || !existingSnapshot) return payload;
  const next = { ...payload };
  for (const field of PRESERVED_SNAPSHOT_METRIC_FIELDS) {
    // 编辑模式的这些字段不可编辑：数据库原值即使是 null，也必须原样保留。
    (next as Record<string, unknown>)[field] = existingSnapshot[field];
  }
  return next;
}

export type SubmissionRoleAssigneeIds = {
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
};

/** 视频与日报复用同一份岗位列映射，避免历史编辑只更新其中一张表。 */
export function buildSubmissionAssigneeColumns(roleUserIds: SubmissionRoleAssigneeIds) {
  return {
    script_author_user_id: roleUserIds.scriptAuthorUserId,
    video_editor_user_id: roleUserIds.videoEditorUserId,
    operator_user_id: roleUserIds.operatorUserId,
  };
}

/**
 * 编辑时未修改的旧责任人允许保留原值（即使已归档）；
 * 只有发生变化的外协责任人才要求是在职同队成员。
 */
export function collectAssigneeIdsRequiringValidation(
  roleUserIds: SubmissionRoleAssigneeIds,
  originalAssignees: SubmissionRoleAssigneeIds | null,
  submitterUserId: string,
) {
  const requiringValidation = new Set<string>();
  for (const key of ["scriptAuthorUserId", "videoEditorUserId", "operatorUserId"] as const) {
    const current = roleUserIds[key];
    if (!current || current === submitterUserId) continue;
    // 只豁免“同一岗位保留同一旧值”；不能因其他岗位未变而全局放行这个人员 ID。
    if (originalAssignees?.[key] === current) continue;
    requiringValidation.add(current);
  }
  return [...requiringValidation];
}
