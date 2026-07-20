import { NextRequest, NextResponse } from "next/server";

import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { callAiJson } from "@/lib/ai/client";
import {
  countIssueSeverities,
  parseSampleQualityResult,
  type SampleQualityIssue,
  type SampleQualityResult,
} from "@/lib/sample-quality";

type DailyReportRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  report_date: string;
  title: string;
  submitter: string | null;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string | null;
};

type VideoRow = {
  id: string;
  anomaly_status: string | null;
  uploaded_at: string | null;
  created_at: string;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
};

type SnapshotRow = {
  id: string;
  snapshot_type: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  avg_play_duration: number | null;
  completion_rate: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  vs_previous: Record<string, unknown> | null;
  captured_at: string;
};

type VideoTagRow = {
  tag_dimension: string | null;
  tag_value: string | null;
};

type OcrAssetMeta = {
  role: string;
  screenshot_type: string | null;
  confidence_score: number | null;
  confirmed: boolean;
  recognized_fields: Record<string, unknown> | null;
};

type SampleQualityContext = {
  report: DailyReportRow;
  previousReport: DailyReportRow | null;
  video: VideoRow | null;
  snapshot: SnapshotRow | null;
  videoTags: VideoTagRow[];
  ocrAssets: OcrAssetMeta[];
  deterministicChecks: string[];
};

type RouteDeps = {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  buildDataAccessScope: typeof buildDataAccessScope;
  callAiJson: typeof callAiJson;
  loadContext: typeof loadSampleQualityContext;
  syncIssues: typeof syncSampleQualityIssues;
  now: () => Date;
};

function toObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseNumberLike(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const matched = value.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const parsed = Number.parseFloat(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOcrAssets(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const role = toTrimmedString(record.role);
      if (!role) return null;
      return {
        role,
        screenshot_type: toTrimmedString(record.screenshot_type) || null,
        confidence_score: typeof record.confidence_score === "number" ? record.confidence_score : null,
        confirmed: record.confirmed === true,
        recognized_fields:
          record.recognized_fields && typeof record.recognized_fields === "object" && !Array.isArray(record.recognized_fields)
            ? (record.recognized_fields as Record<string, unknown>)
            : null,
      } satisfies OcrAssetMeta;
    })
    .filter((item): item is OcrAssetMeta => item !== null);
}

function buildDeterministicChecks(input: {
  report: DailyReportRow;
  previousReport: DailyReportRow | null;
  video: VideoRow | null;
  snapshot: SnapshotRow | null;
  videoTags: VideoTagRow[];
  ocrAssets: OcrAssetMeta[];
}) {
  const checks: string[] = [];

  const reportPlayCount = input.report.play_count ?? 0;
  const reportCompletionRate = parseNumberLike(input.report.completion_rate);
  const snapshotCompletionRate = input.snapshot?.completion_rate ?? null;
  const likes = input.report.likes ?? input.snapshot?.likes ?? 0;
  const comments = input.report.comments ?? input.snapshot?.comments ?? 0;
  const shares = input.report.shares ?? input.snapshot?.shares ?? 0;
  const favorites = input.report.favorites ?? input.snapshot?.favorites ?? 0;

  if (!input.snapshot) {
    checks.push("缺少 24h 快照，无法确认样本是否完整。");
  }

  if (reportCompletionRate != null && (reportCompletionRate < 0 || reportCompletionRate > 100)) {
    checks.push(`日报完播率 ${reportCompletionRate}% 超出 0-100 范围。`);
  }

  if (snapshotCompletionRate != null && (snapshotCompletionRate < 0 || snapshotCompletionRate > 100)) {
    checks.push(`快照完播率 ${snapshotCompletionRate}% 超出 0-100 范围。`);
  }

  for (const [label, value] of [
    ["点赞", likes],
    ["评论", comments],
    ["分享", shares],
    ["收藏", favorites],
  ] as const) {
    if (reportPlayCount > 0 && value > reportPlayCount) {
      checks.push(`${label}数 ${value} 大于播放数 ${reportPlayCount}。`);
    }
  }

  if ((input.report.content ?? "").trim().length < 10) {
    checks.push("文案长度少于 10 个字，样本内容过短。");
  }

  const hasTopicTag = input.videoTags.some((tag) => tag.tag_dimension === "话题");
  const hasKeywordTag = input.videoTags.some((tag) => tag.tag_dimension === "关键词");
  if (!hasTopicTag) checks.push("缺少话题标签。");
  if (!hasKeywordTag) checks.push("缺少关键词标签。");

  const lowConfidenceAssets = input.ocrAssets.filter(
    (asset) => typeof asset.confidence_score === "number" && asset.confidence_score < 0.5,
  );
  if (lowConfidenceAssets.length > 0) {
    checks.push(`有 ${lowConfidenceAssets.length} 张截图 OCR 置信度低于 0.5。`);
  }

  if (input.ocrAssets.length === 0) {
    checks.push("当前快照没有落下 OCR 置信度元数据。");
  }

  if (input.previousReport?.play_count && reportPlayCount > 0) {
    const ratio = reportPlayCount / Math.max(input.previousReport.play_count, 1);
    if (ratio >= 10) {
      checks.push(`和昨日比播放放大到 ${ratio.toFixed(1)} 倍，需人工复核。`);
    } else if (ratio <= 0.1) {
      checks.push(`和昨日比播放只剩 ${(ratio * 100).toFixed(0)}%，需人工复核。`);
    }
  }

  if (input.video?.anomaly_status === "未满24h" && input.snapshot) {
    checks.push("异常状态写的是未满24h，但当前已经有 24h 快照。");
  }

  if (input.video?.anomaly_status !== "未满24h" && !input.snapshot) {
    checks.push("异常状态不是未满24h，但当前缺少 24h 快照。");
  }

  return checks;
}

async function loadLinkedVideo(adminSupabase: ReturnType<typeof createAdminClient>, report: DailyReportRow) {
  if (!report.account_id) return null;

  const exactQuery = await adminSupabase
    .from("videos")
    .select("id, anomaly_status, uploaded_at, created_at, video_title, content, published_at")
    .eq("lifecycle_state", "active")
    .eq("account_id", report.account_id)
    .eq("user_id", report.user_id)
    .eq("uploaded_at", report.uploaded_at ?? "")
    .maybeSingle();

  if (exactQuery.data) {
    return exactQuery.data as VideoRow;
  }

  if (!report.uploaded_at) {
    return null;
  }

  const uploadedAt = new Date(report.uploaded_at);
  if (Number.isNaN(uploadedAt.getTime())) {
    return null;
  }

  const start = new Date(uploadedAt.getTime() - 10 * 60 * 1000).toISOString();
  const end = new Date(uploadedAt.getTime() + 10 * 60 * 1000).toISOString();
  const fallbackQuery = await adminSupabase
    .from("videos")
    .select("id, anomaly_status, uploaded_at, created_at, video_title, content, published_at")
    .eq("lifecycle_state", "active")
    .eq("account_id", report.account_id)
    .eq("user_id", report.user_id)
    .gte("uploaded_at", start)
    .lte("uploaded_at", end)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (fallbackQuery.data as VideoRow | null) ?? null;
}

async function loadSampleQualityContext(
  adminSupabase: ReturnType<typeof createAdminClient>,
  reportId: string,
) {
  const { data: reportData, error: reportError } = await adminSupabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, report_date, title, submitter, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at",
    )
    .eq("id", reportId)
    .single();

  if (reportError || !reportData) {
    return null;
  }

  const report = reportData as DailyReportRow;
  const video = await loadLinkedVideo(adminSupabase, report);

  const [snapshotQuery, previousReportQuery, videoTagsQuery] = await Promise.all([
    video
      ? adminSupabase
          .from("video_metrics_snapshots")
          .select(
            "id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_convert, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, vs_previous, captured_at",
          )
          .eq("video_id", video.id)
          .eq("snapshot_type", "24h")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.account_id
      ? adminSupabase
          .from("daily_reports")
          .select(
            "id, user_id, account_id, report_date, title, submitter, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at",
          )
          .eq("account_id", report.account_id)
          .lt("report_date", report.report_date)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : adminSupabase
          .from("daily_reports")
          .select(
            "id, user_id, account_id, report_date, title, submitter, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at",
          )
          .eq("user_id", report.user_id)
          .lt("report_date", report.report_date)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
    video
      ? adminSupabase.from("video_tags").select("tag_dimension, tag_value").eq("video_id", video.id)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const snapshot = (snapshotQuery.data as SnapshotRow | null) ?? null;
  const previousReport = (previousReportQuery.data as DailyReportRow | null) ?? null;
  const videoTags = (videoTagsQuery.data as VideoTagRow[] | null) ?? [];
  const ocrAssets = normalizeOcrAssets(snapshot?.vs_previous && toObject(snapshot.vs_previous).ocr_assets);

  return {
    report,
    previousReport,
    video,
    snapshot,
    videoTags,
    ocrAssets,
    deterministicChecks: buildDeterministicChecks({
      report,
      previousReport,
      video,
      snapshot,
      videoTags,
      ocrAssets,
    }),
  } satisfies SampleQualityContext;
}

async function syncSampleQualityIssues(input: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  reportId: string;
  videoId: string | null;
  issues: SampleQualityIssue[];
  now: string;
}) {
  const { error: resolveError } = await input.adminSupabase
    .from("sample_quality_issues")
    .update({ resolved_at: input.now })
    .eq("report_id", input.reportId)
    .is("resolved_at", null);

  if (resolveError) {
    throw new Error(resolveError.message);
  }

  const persistableIssues = input.issues.filter((issue) => issue.severity === "critical" || issue.severity === "warning");
  if (persistableIssues.length === 0) {
    return;
  }

  const severity = persistableIssues.some((issue) => issue.severity === "critical") ? "critical" : "warning";
  const { error } = await input.adminSupabase.from("sample_quality_issues").insert({
    report_id: input.reportId,
    video_id: input.videoId,
    severity,
    issues_json: persistableIssues,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function buildSampleQualityPrompt(context: SampleQualityContext, checkedAt: string) {
  const reportMetrics = {
    play_count: context.report.play_count,
    completion_rate: parseNumberLike(context.report.completion_rate),
    avg_play_duration: parseNumberLike(context.report.avg_play_duration),
    bounce_rate_2s: parseNumberLike(context.report.bounce_rate_2s),
    completion_rate_5s: parseNumberLike(context.report.completion_rate_5s),
    likes: context.report.likes,
    comments: context.report.comments,
    shares: context.report.shares,
    favorites: context.report.favorites,
    follower_gain: context.report.follower_gain,
    follower_convert: context.report.follower_convert,
  };

  const previousMetrics = context.previousReport
    ? {
        play_count: context.previousReport.play_count,
        completion_rate: parseNumberLike(context.previousReport.completion_rate),
        likes: context.previousReport.likes,
        comments: context.previousReport.comments,
        shares: context.previousReport.shares,
        favorites: context.previousReport.favorites,
        follower_gain: context.previousReport.follower_gain,
        follower_convert: context.previousReport.follower_convert,
      }
    : null;

  return [
    "你是 DYData 上传样本质量检查员。",
    "只返回 JSON，不要 markdown，不要解释。",
    '固定结构：{"overallStatus":"pass|warning|fail","issues":[{"severity":"critical|warning|info","field":"字段名","title":"问题标题","detail":"说人话解释","suggestedFix":"edit_field|reupload_screenshot|manual_review"}]}',
    "检查规则：",
    "1. 看数值范围是否合理，比如完播率必须在 0-100 之间，点赞/评论/分享/收藏通常不应大于播放。",
    "2. 看 OCR 置信度，低于 0.5 的截图要重点标记。",
    "3. 看是否缺少关键字段，包括文案、话题标签、关键词标签。",
    "4. 对比昨日同账号数据，异常暴涨或暴跌要提示人工复核。",
    "5. 看内容质量，过短、明显占位、无法支撑复盘的都要提示。",
    "6. 看 anomaly_status 和 24h 快照是否一致。",
    "7. 只输出真的有价值的问题；没有问题时 issues 返回空数组，overallStatus=pass。",
    "",
    `检查时间：${checkedAt}`,
    `日报：${JSON.stringify({
      id: context.report.id,
      report_date: context.report.report_date,
      title: context.report.title,
      submitter: context.report.submitter,
      content: context.report.content,
      uploaded_at: context.report.uploaded_at,
      metrics: reportMetrics,
    })}`,
    `昨日同账号：${JSON.stringify(previousMetrics)}`,
    `视频：${JSON.stringify(context.video)}`,
    `24h 快照：${JSON.stringify(context.snapshot)}`,
    `OCR 资产：${JSON.stringify(context.ocrAssets)}`,
    `标签：${JSON.stringify(context.videoTags)}`,
    `程序已发现的硬规则提示：${JSON.stringify(context.deterministicChecks)}`,
  ].join("\n");
}

function canAccessReport(scope: DataAccessScope | null, report: DailyReportRow, actorUserId: string) {
  if (!scope) return report.user_id === actorUserId;
  return scope.visibleUserIds.includes(report.user_id);
}

export async function buildSampleQualityCheckResponse(
  input: { reportId: string },
  deps: RouteDeps = {
    createClient,
    createAdminClient,
    buildDataAccessScope,
    callAiJson,
    loadContext: loadSampleQualityContext,
    syncIssues: syncSampleQualityIssues,
    now: () => new Date(),
  },
) {
  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const reportId = toTrimmedString(input.reportId);
  if (!reportId) {
    return NextResponse.json({ error: "缺少 reportId" }, { status: 400 });
  }

  const adminSupabase = deps.createAdminClient();
  const scope = await deps.buildDataAccessScope(adminSupabase, user.id);
  const context = await deps.loadContext(adminSupabase, reportId);

  if (!context) {
    return NextResponse.json({ error: "日报不存在" }, { status: 404 });
  }

  if (!canAccessReport(scope, context.report, user.id)) {
    return NextResponse.json({ error: "无权查看这条日报" }, { status: 403 });
  }

  const checkedAt = deps.now().toISOString();
  const prompt = buildSampleQualityPrompt(context, checkedAt);

  try {
    const aiResult = await deps.callAiJson(prompt, {
      maxTokens: 1600,
      timeoutMs: 15000,
      featureKey: "sample_quality_check",
    });

    const parsed = parseSampleQualityResult(aiResult.content, reportId, checkedAt);
    if (!parsed) {
      return NextResponse.json({ error: "AI 返回结构解析失败" }, { status: 500 });
    }

    await deps.syncIssues({
      adminSupabase,
      reportId,
      videoId: context.video?.id ?? null,
      issues: parsed.issues,
      now: checkedAt,
    });

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "样本质量检查失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = toObject(await request.json());
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  return buildSampleQualityCheckResponse({
    reportId: toTrimmedString(body.reportId),
  });
}
