/**
 * 历史手稿编辑窗口专用的编辑详情读取。
 *
 * 与投稿面板的 `fetchVideoSubmissionEditDetail` 读同一个接口，但两者对「日报没有
 * 绑定视频」的处理不同：投稿面板的用途是重传视频，没有视频就没有可编辑对象，
 * 所以它按错误处理；历史手稿只编辑日报侧，没有视频是合法状态。接口因此在 DTO
 * 层区分两种形态，由调用方各自决定呈现，不在客户端靠错误文案猜测。
 */

import {
  getVideoSubmissionEditDetailError,
  type UnboundDailyReportDetail,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

type ActivityRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HistoryReportEditDetailOutcome =
  | { kind: "video"; detail: VideoSubmissionEditDetail }
  | { kind: "dailyReportOnly"; report: UnboundDailyReportDetail };

export type HistoryReportEditDetailInput = { accountId: string; bizDate: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function getUnboundDailyReportDetailError(
  value: unknown,
  expected: HistoryReportEditDetailInput,
): string | null {
  if (!isRecord(value)) return "日报详情格式错误，未读取到原日报记录";
  if (typeof value.reportId !== "string" || !value.reportId.trim()) {
    return "日报详情缺少日报 ID，不能安全保存";
  }
  if (value.accountId !== expected.accountId || value.bizDate !== expected.bizDate) {
    return "日报详情与当前账号或日期不一致，不能安全保存";
  }
  if (value.dataSource !== null && value.dataSource !== "ai" && value.dataSource !== "manual") {
    return "日报详情的来源标记不正确，不能安全保存";
  }
  if (
    !isNullableString(value.scriptAuthorUserId) ||
    !isNullableString(value.videoEditorUserId) ||
    !isNullableString(value.operatorUserId)
  ) {
    return "日报详情的历史责任人不完整，不能安全保存";
  }
  if (!Array.isArray(value.assigneeProfiles)) {
    return "日报详情的历史档案不完整，不能安全保存";
  }
  return null;
}

export async function fetchHistoryReportEditDetail(
  input: HistoryReportEditDetailInput,
  request: ActivityRequest = fetch,
): Promise<HistoryReportEditDetailOutcome> {
  const params = new URLSearchParams({ account_id: input.accountId, biz_date: input.bizDate });
  const response = await request(`/api/video-submit/edit-detail?${params.toString()}`);
  const payload = (await response.json()) as { detail?: unknown; unboundReport?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "加载原记录详情失败");
  }

  if (payload.unboundReport !== undefined && payload.unboundReport !== null) {
    const error = getUnboundDailyReportDetailError(payload.unboundReport, input);
    if (error) throw new Error(error);
    return { kind: "dailyReportOnly", report: payload.unboundReport as UnboundDailyReportDetail };
  }

  const error = getVideoSubmissionEditDetailError(payload.detail, input);
  if (error) throw new Error(error);
  return { kind: "video", detail: payload.detail as VideoSubmissionEditDetail };
}
