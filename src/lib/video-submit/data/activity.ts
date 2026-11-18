import {
  getVideoSubmissionEditDetailError,
  type UnboundDailyReportDetail,
  type VideoSubmissionEditDetail,
} from "@/app/(app)/dashboard/video-submit-form-state";
import type {
  ActivityRequest,
  AsyncActivityData,
} from "@/lib/video-submit/domain/types";

export async function fetchDashboardActivity(
  request: ActivityRequest = fetch,
  options: { page?: number; pageSize?: number } = {},
): Promise<AsyncActivityData> {
  const params = new URLSearchParams();
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString();
  const response = await request(`/api/dashboard/activity${query ? `?${query}` : ""}`);
  const payload = (await response.json()) as Partial<AsyncActivityData> & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "活动记录加载失败");
  }
  if (!Array.isArray(payload.history)) {
    throw new Error("活动记录格式无效");
  }

  return {
    history: payload.history,
    page: typeof payload.page === "number" ? payload.page : options.page ?? 1,
    pageSize: typeof payload.pageSize === "number" ? payload.pageSize : options.pageSize ?? payload.history.length,
    hasMore: payload.hasMore === true,
  };
}

export async function fetchVideoSubmissionEditDetail(
  input: { accountId: string; bizDate: string; reportId?: string | null },
  request: ActivityRequest = fetch,
): Promise<VideoSubmissionEditDetail> {
  const params = new URLSearchParams({ account_id: input.accountId, biz_date: input.bizDate });
  if (input.reportId) params.set("report_id", input.reportId);
  const response = await request(`/api/video-submit/edit-detail?${params.toString()}`);
  const payload = (await response.json()) as { detail?: unknown; unboundReport?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "加载原视频详情失败");
  }
  if (payload.unboundReport !== undefined && payload.unboundReport !== null) {
    const error = getVideoSubmissionEditDetailError(payload.unboundReport, input);
    if (error) throw new Error(error);
    return payload.unboundReport as UnboundDailyReportDetail;
  }
  const error = getVideoSubmissionEditDetailError(payload.detail, input);
  if (error) throw new Error(error);
  return payload.detail as VideoSubmissionEditDetail;
}
