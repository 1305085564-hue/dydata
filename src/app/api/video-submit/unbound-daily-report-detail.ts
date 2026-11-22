import { normalizeDailyReportDataSource } from "@/lib/daily-report-data-source";
import { isUuidLike } from "./stability";
import { normalizeAssigneeProfiles } from "@/lib/video-submit/domain/assignee-profiles";
import type { UnboundDailyReportDetail } from "@/lib/video-submit/domain/edit-detail-types";

export type UnboundDailyReportDetailResult =
  | { ok: true; detail: UnboundDailyReportDetail }
  | { ok: false; error: string };

export interface UnboundDailyReportDetailSource {
  dailyReport: {
    id: string;
    account_id: string;
    report_date: string;
    data_source?: unknown;
    title?: string | null;
    content?: string | null;
    published_at?: string | null;
    uploaded_at?: string | null;
    play_count?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    favorites?: number | null;
    follower_gain?: number | null;
    follower_convert?: number | null;
    avg_play_duration?: string | null;
    bounce_rate_2s?: string | null;
    completion_rate_5s?: string | null;
    completion_rate?: string | null;
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
  };
  assigneeProfiles?: unknown;
  bizDate: string;
}

function parseReportMetricText(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[秒%]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalAssigneeId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && isUuidLike(value)) return value;
  return undefined;
}

export function buildUnboundDailyReportDetail(
  source: UnboundDailyReportDetailSource,
): UnboundDailyReportDetailResult {
  const report = source.dailyReport;
  if (typeof report?.id !== "string" || !report.id.trim()) {
    return { ok: false, error: "编辑详情不完整：缺少日报 ID" };
  }
  if (typeof report.account_id !== "string" || !report.account_id.trim()) {
    return { ok: false, error: "编辑详情不完整：缺少日报账号" };
  }
  if (report.report_date !== source.bizDate) {
    return { ok: false, error: "编辑详情冲突：日报与请求日期不匹配" };
  }

  const scriptAuthorUserId = normalizeOptionalAssigneeId(report.script_author_user_id);
  const videoEditorUserId = normalizeOptionalAssigneeId(report.video_editor_user_id);
  const operatorUserId = normalizeOptionalAssigneeId(report.operator_user_id);
  if (
    scriptAuthorUserId === undefined ||
    videoEditorUserId === undefined ||
    operatorUserId === undefined
  ) {
    return { ok: false, error: "编辑详情不完整：日报责任人格式错误" };
  }

  return {
    ok: true,
    detail: {
      historyCapability: "read_only_missing_required_data",
      reportId: report.id,
      videoId: null,
      accountId: report.account_id,
      bizDate: source.bizDate,
      dataSource: normalizeDailyReportDataSource(report.data_source),
      meta: {
        videoUrl: null,
        videoTitle: report.title ?? "",
        content: report.content ?? "",
        publishedAt: report.published_at ?? null,
        publishedAtText: null,
        anomalyStatus: "normal",
        punishType: null,
        platformNotice: null,
        appeal: null,
        topicTag: null,
        videoForm: null,
        contentKeywords: [],
        scriptAuthorUserId,
        videoEditorUserId,
        operatorUserId,
      },
      metrics: {
        playCount: report.play_count ?? null,
        likes: report.likes ?? null,
        comments: report.comments ?? null,
        shares: report.shares ?? null,
        favorites: report.favorites ?? null,
        followerGain: report.follower_gain ?? null,
        followerLoss: null,
        followerConvert: report.follower_convert ?? null,
        avgPlayDuration: parseReportMetricText(report.avg_play_duration),
        avgPlayRatio: null,
        bounceRate2s: parseReportMetricText(report.bounce_rate_2s),
        completionRate5s: parseReportMetricText(report.completion_rate_5s),
        completionRate: parseReportMetricText(report.completion_rate),
      },
      assets: [],
      uploadedAt: report.uploaded_at ?? null,
      scriptAuthorUserId,
      videoEditorUserId,
      operatorUserId,
      assigneeProfiles: normalizeAssigneeProfiles(source.assigneeProfiles),
    },
  };
}
