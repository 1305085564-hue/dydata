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
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { assertSupabaseQuerySucceeded, SupabaseQueryFailure } from "@/lib/supabase/query-error";
import { createAdminClient } from "@/lib/supabase/admin";

type ScopedWorkVideoCandidate = WorkVideoCandidate & {
  userId: string;
  accountOwnerUserId: string | null;
};

export type WorkVideoRouteDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  createAdminClient: typeof createAdminClient;
  loadScopedReport: typeof loadScopedReport;
  loadActiveVideosForAccount: typeof loadActiveVideosForAccount;
};

const defaultDependencies: WorkVideoRouteDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  createAdminClient,
  loadScopedReport,
  loadActiveVideosForAccount,
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
    .select("id, user_id, account_id, report_date")
    .eq("id", reportId)
    .in("user_id", visibleUserIds)
    .maybeSingle();
  assertSupabaseQuerySucceeded(result.error, "读取岗位作品日报失败");
  if (!result.data) return null;

  return {
    id: result.data.id,
    userId: result.data.user_id,
    accountId: result.data.account_id,
    reportDate: result.data.report_date,
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
    .select("id, user_id, account_id, published_at, uploaded_at, accounts!inner(profile_id)")
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
    published_at: string | null;
    uploaded_at: string | null;
    accounts: { profile_id: string | null } | Array<{ profile_id: string | null }> | null;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
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
  if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const permissionContext = await dependencies.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  try {
    const supabase = dependencies.createAdminClient();
    const report = await dependencies.loadScopedReport(
      supabase,
      reportId,
      permissionContext.scope.visibleUserIds,
    );
    if (!report) {
      return NextResponse.json({ error: "日报不存在或不在当前可查看范围" }, { status: 404 });
    }

    const candidates = await dependencies.loadActiveVideosForAccount(
      supabase,
      report.accountId,
      report.reportDate,
    );
    const visibleUserIds = new Set(permissionContext.scope.visibleUserIds);
    const visibleCandidates = candidates.filter((video) => (
      visibleUserIds.has(video.accountOwnerUserId ?? video.userId)
    ));
    const match = matchWorkVideoByBusinessDate({ report, videos: visibleCandidates });

    if (match.kind === "not_found") {
      return NextResponse.json({ error: "该作品暂未同步到视频复盘" }, { status: 404 });
    }
    if (match.kind === "ambiguous") {
      return NextResponse.json({ error: "同一账号和日期匹配到多条视频，请从视频复盘列表确认" }, { status: 409 });
    }
    return NextResponse.json({ videoId: match.videoId });
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "打开视频复盘失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
