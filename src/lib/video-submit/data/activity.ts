import {
  getVideoSubmissionEditDetailError,
  type VideoSubmissionEditDetail,
} from "@/app/(app)/dashboard/video-submit-form-state";
import type {
  ActivityRequest,
  AsyncActivityData,
} from "@/lib/video-submit/domain/types";

export async function fetchDashboardActivity(
  request: ActivityRequest = fetch,
): Promise<AsyncActivityData> {
  const response = await request("/api/dashboard/activity");
  const payload = (await response.json()) as Partial<AsyncActivityData> & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "活动记录加载失败");
  }
  if (!Array.isArray(payload.history)) {
    throw new Error("活动记录格式无效");
  }

  return {
    history: payload.history,
  };
}

export async function fetchVideoSubmissionEditDetail(
  input: { accountId: string; bizDate: string },
  request: ActivityRequest = fetch,
): Promise<VideoSubmissionEditDetail> {
  const params = new URLSearchParams({ account_id: input.accountId, biz_date: input.bizDate });
  const response = await request(`/api/video-submit/edit-detail?${params.toString()}`);
  const payload = (await response.json()) as { detail?: unknown; unboundReport?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "加载原视频详情失败");
  }
  // 日报没有绑定视频：面板的用途是重传视频，没有视频就没有可编辑对象，
  // 沿用「没有可编辑」文案，交由面板既有的合法缺失分支呈现。
  if (payload.unboundReport !== undefined && payload.unboundReport !== null) {
    throw new Error("该账号该日期没有可编辑的原视频");
  }
  const error = getVideoSubmissionEditDetailError(payload.detail, input);
  if (error) throw new Error(error);
  return payload.detail as VideoSubmissionEditDetail;
}
