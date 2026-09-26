import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/app/api/production/_shared";
import {
  buildShanghaiBusinessDayWindow,
  matchWorkVideoByBusinessDate,
  type WorkVideoCandidate,
  type WorkVideoReport,
} from "@/lib/collaboration-work-video";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { loadAdminContentVideoDetail } from "@/lib/loaders/admin-content-page";
import { canReadWorkVideo } from "@/lib/route-permissions";
import { assertSupabaseQuerySucceeded, SupabaseQueryFailure } from "@/lib/supabase/query-error";
import { createAdminClient } from "@/lib/supabase/admin";

/** 权限不足时的用户可读文案：说清楚是谁不能看，不要退化成"无权限"。 */
export const WORK_VIDEO_FORBIDDEN_MESSAGE = "当前账号不能查看此作品复盘";

type ScopedWorkVideoCandidate = WorkVideoCandidate & {
  userId: string;
  accountOwnerUserId: string | null;
};

export type WorkVideoRouteDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  resolveCollaborationScope: typeof resolveCollaborationScope;
  createAdminClient: typeof createAdminClient;
  loadScopedReport: typeof loadScopedReport;
  loadActiveVideosForAccount: typeof loadActiveVideosForAccount;
  loadAdminContentVideoDetail: typeof loadAdminContentVideoDetail;
};

const defaultDependencies: WorkVideoRouteDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  resolveCollaborationScope,
  createAdminClient,
  loadScopedReport,
  loadActiveVideosForAccount,
  loadAdminContentVideoDetail,
};

function firstAccountOwner(value: { profile_id: string | null } | Array<{ profile_id: string | null }> | null) {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value)?.profile_id ?? null;
}

export async function loadScopedReport(
  supabase: Pick<SupabaseClient, "from">,
  reportId: string,
  visibleUserIds: string[],
): Promise<(WorkVideoReport & { userId: string }) | null> {
  if (visibleUserIds.length === 0) return null;

  const result = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, report_date, video_id, title")
    .eq("id", reportId)
    .in("user_id", visibleUserIds)
    .eq("is_void", false)
    .maybeSingle();
  assertSupabaseQuerySucceeded(result.error, "读取岗位作品日报失败");
  if (!result.data) return null;

  return {
    id: result.data.id,
    userId: result.data.user_id,
    accountId: result.data.account_id,
    reportDate: result.data.report_date,
    videoId: result.data.video_id ?? null,
    title: result.data.title ?? null,
  };
}

export async function loadActiveVideosForAccount(
  supabase: Pick<SupabaseClient, "from">,
  accountId: string,
  reportDate: string,
): Promise<ScopedWorkVideoCandidate[]> {
  const window = buildShanghaiBusinessDayWindow(reportDate);
  if (!window) return [];

  const result = await supabase
    .from("videos")
    .select("id, user_id, account_id, video_title, published_at, uploaded_at, accounts!inner(profile_id)")
    .eq("account_id", accountId)
    .eq("lifecycle_state", "active")
    .or(
      `and(published_at.gte.${window.start},published_at.lt.${window.end}),and(uploaded_at.gte.${window.start},uploaded_at.lt.${window.end})`,
    );
  assertSupabaseQuerySucceeded(result.error, "读取视频复盘作品失败");

  return ((result.data ?? []) as Array<{
    id: string;
    user_id: string;
    account_id: string;
    video_title: string | null;
    published_at: string | null;
    uploaded_at: string | null;
    accounts: { profile_id: string | null } | Array<{ profile_id: string | null }> | null;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    title: row.video_title,
    publishedAt: row.published_at,
    uploadedAt: row.uploaded_at,
    accountOwnerUserId: firstAccountOwner(row.accounts),
  }));
}

export async function buildWorkVideoResponse(
  request: NextRequest,
  dependencies: WorkVideoRouteDependencies = defaultDependencies,
) {
  const reportId = request.nextUrl.searchParams.get("reportId")?.trim() ?? "";
  if (!UUID_PATTERN.test(reportId)) {
    return NextResponse.json({ error: "reportId 必须是合法 UUID" }, { status: 400 });
  }

  const auth = await dependencies.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canReadWorkVideo(auth.actor.permissions)) {
    return NextResponse.json({ error: WORK_VIDEO_FORBIDDEN_MESSAGE }, { status: 403 });
  }

  const permissionContext = await dependencies.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  try {
    const supabase = dependencies.createAdminClient();
    // 数据管理模块范围与首屏同源：组员放宽为本公司，无公司归属降级只看自己；
    // 范围只由 actor 身份决定，不接受请求参数。
    const resolution = await dependencies.resolveCollaborationScope(
      supabase,
      permissionContext.scope,
    );
    // 作品归属校验沿用同一个数据管理范围：组员按本公司，admin/所有者按原范围，不因请求参数扩大。
    const collaborationScope = {
      ...permissionContext.scope,
      visibleUserIds: resolution.visibleUserIds,
      activeVisibleUserIds: resolution.activeVisibleUserIds,
    };
    const report = await dependencies.loadScopedReport(
      supabase,
      reportId,
      resolution.visibleUserIds,
    );
    if (!report) {
      return NextResponse.json({ error: "日报不存在或不在当前可查看范围" }, { status: 404 });
    }

    if (report.videoId) {
      const detail = await dependencies.loadAdminContentVideoDetail({
        supabase,
        scope: collaborationScope,
        videoId: report.videoId,
      });
      if (!detail || detail.video.account_id !== report.accountId) {
        return NextResponse.json({ error: "该作品暂未同步到视频复盘" }, { status: 404 });
      }

      return NextResponse.json({
        videoId: report.videoId,
        video: detail.video,
        snapshot: detail.snapshot,
        reviewReadiness: detail.reviewReadiness,
        topicKind: detail.topicKind,
      });
    }

    const candidates = await dependencies.loadActiveVideosForAccount(
      supabase,
      report.accountId,
      report.reportDate,
    );
    const visibleUserIds = new Set(resolution.visibleUserIds);
    const visibleCandidates = candidates.filter((video) => (
      visibleUserIds.has(video.accountOwnerUserId ?? video.userId)
    ));
    const match = matchWorkVideoByBusinessDate({ report, videos: visibleCandidates });

    if (match.kind === "not_found") {
      return NextResponse.json({ error: "该作品暂未同步到视频复盘" }, { status: 404 });
    }
    if (match.kind === "ambiguous") {
      return NextResponse.json(
        {
          error: `同一账号和日期匹配到 ${match.count} 条视频。为避免打开错作品，请到内容中心按账号和日期确认具体作品。`,
        },
        { status: 409 },
      );
    }

    const detail = await dependencies.loadAdminContentVideoDetail({
      supabase,
      scope: collaborationScope,
      videoId: match.videoId,
    });

    return NextResponse.json({
      videoId: match.videoId,
      video: detail?.video ?? null,
      snapshot: detail?.snapshot ?? null,
      reviewReadiness: detail?.reviewReadiness ?? null,
      topicKind: detail?.topicKind ?? null,
    });
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "打开视频复盘失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
