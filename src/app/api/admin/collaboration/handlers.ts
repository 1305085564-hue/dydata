import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/app/api/production/_shared";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { resolveActorCompanyRole } from "@/lib/company-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseQueryFailure } from "@/lib/supabase/query-error";
import {
  assertProfilesExist,
  buildUnattributedReports,
  CollaborationNotFoundError,
  loadAttributionReport,
  loadCollaborationMonthDataset,
  loadPersonData,
  parseAttributionPayload,
  parseMonthParams,
  updateAttributionAtomically,
} from "./_shared";

export async function buildPersonResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, resolveCollaborationScope, loadPersonData },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const targetUserId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!UUID_PATTERN.test(targetUserId)) {
    return NextResponse.json({ error: "userId 必须是合法 UUID" }, { status: 400 });
  }
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  try {
    const supabase = deps.createAdminClient();
    // 数据管理模块范围与首屏同源：组员放宽为本公司，无公司归属降级只看自己。
    const resolution = await deps.resolveCollaborationScope(supabase, context.scope);
    if (!resolution.visibleUserIds.includes(targetUserId)) {
      return NextResponse.json({ error: "不能查看当前权限范围外的成员" }, { status: 403 });
    }
    return NextResponse.json(await deps.loadPersonData({
      supabase,
      visibleUserIds: resolution.visibleUserIds,
      targetUserId,
      year: parsed.range.year,
      month: parsed.range.month,
    }));
  } catch (error) {
    if (error instanceof CollaborationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载个人岗位数据失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildAttributionResponse(
  request: Request,
  deps = {
    requireAdminActor,
    buildPermissionContextForActor,
    createAdminClient,
    loadAttributionReport,
    assertProfilesExist,
    updateAttributionAtomically,
  },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const parsed = parseAttributionPayload(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const auth = await deps.requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const actorRoleResolution = resolveActorCompanyRole(auth.actor.role, auth.actor.companyRole);
  if (actorRoleResolution.conflict || (actorRoleResolution.companyRole !== "admin" && actorRoleResolution.companyRole !== "company_owner")) {
    return NextResponse.json({ ok: false, error: "无权限补录岗位归属" }, { status: 403 });
  }
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) {
    return NextResponse.json({ ok: false, error: "用户权限范围加载失败" }, { status: 403 });
  }
  try {
    const supabase = deps.createAdminClient();
    const report = await deps.loadAttributionReport(supabase, parsed.data.reportId);
    if (!report) {
      return NextResponse.json({ ok: false, error: "日报不存在或早于岗位统计起点" }, { status: 404 });
    }
    if (report.user_id === auth.actor.userId) {
      return NextResponse.json({ ok: false, error: "不能修改自己提交的日报" }, { status: 403 });
    }
    const activeVisibleUserIds = context.scope.activeVisibleUserIds ?? context.scope.visibleUserIds;
    if (!activeVisibleUserIds.includes(report.user_id)) {
      return NextResponse.json({ ok: false, error: "不能修改已归档或当前权限范围外的日报" }, { status: 403 });
    }
    const assignedUserIds = [
      parsed.data.scriptAuthorUserId,
      parsed.data.videoEditorUserId,
      parsed.data.operatorUserId,
    ].filter((value): value is string => value !== null);
    if (assignedUserIds.some((userId) => !activeVisibleUserIds.includes(userId))) {
      return NextResponse.json({ ok: false, error: "归属成员超出当前可操作范围" }, { status: 403 });
    }
    if (!(await deps.assertProfilesExist(supabase, assignedUserIds))) {
      return NextResponse.json({ ok: false, error: "归属成员不存在" }, { status: 400 });
    }
    const result = await deps.updateAttributionAtomically(supabase, parsed.data);
    return NextResponse.json({
      ok: true,
      videoUpdated: result.videoUpdated,
      message: result.videoUpdated ? null : "暂未匹配到视频，日报已保存，后续可手动关联",
    });
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "更新岗位归属失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function buildUnattributedResponse(
  request: NextRequest,
  deps = {
    requireAdminActor,
    buildPermissionContextForActor,
    createAdminClient,
    resolveCollaborationScope,
    loadCollaborationMonthDataset,
    buildUnattributedReports,
  },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });

  try {
    const supabase = deps.createAdminClient();
    // 数据管理模块范围与首屏同源：弹窗列表与首屏徽标数必须出自同一份 visibleUserIds。
    const resolution = await deps.resolveCollaborationScope(supabase, context.scope);
    const dataset = await deps.loadCollaborationMonthDataset({
      supabase,
      visibleUserIds: resolution.visibleUserIds,
      range: parsed.range,
    });
    const activeVisibleUserIds = resolution.activeVisibleUserIds;
    const activeSet = new Set(activeVisibleUserIds);
    // 与 PATCH attribution 的校验口径对齐：归档成员不可指派、本人日报不可自改
    const reports = deps
      .buildUnattributedReports(dataset.currentRows, dataset.profiles, dataset.accounts)
      .filter((report) => report.creatorUserId !== auth.actor.userId);
    const candidateMembers = dataset.profiles
      .filter((p) => p.name && activeSet.has(p.id))
      .map((p) => ({ id: p.id, name: p.name! }));

    return NextResponse.json({
      ok: true,
      reports,
      candidateMembers,
    });
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载待补归属作品失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
