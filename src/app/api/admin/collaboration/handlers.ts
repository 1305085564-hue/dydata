import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/app/api/production/_shared";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseQueryFailure } from "@/lib/supabase/query-error";
import {
  assertProfilesExist,
  CollaborationNotFoundError,
  loadAttributionReport,
  loadOperatorsData,
  loadPersonData,
  loadStaffData,
  loadSummaryData,
  loadTalentsData,
  parseAttributionPayload,
  parseMonthParams,
  updateAttributionAtomically,
} from "./_shared";

export async function buildSummaryResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, loadSummaryData },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  try {
    return NextResponse.json(await deps.loadSummaryData({
      supabase: deps.createAdminClient(),
      visibleUserIds: context.scope.visibleUserIds,
      range: parsed.range,
    }));
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载协作归属统计失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildOperatorsResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, loadOperatorsData },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  try {
    return NextResponse.json(await deps.loadOperatorsData({
      supabase: deps.createAdminClient(),
      visibleUserIds: context.scope.visibleUserIds,
      range: parsed.range,
    }));
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载运营协作统计失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildStaffResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, loadStaffData },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const role = request.nextUrl.searchParams.get("role");
  if (role !== "writer" && role !== "editor") {
    return NextResponse.json({ error: "role 只能是 writer 或 editor" }, { status: 400 });
  }
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  try {
    return NextResponse.json(await deps.loadStaffData({
      supabase: deps.createAdminClient(),
      visibleUserIds: context.scope.visibleUserIds,
      range: parsed.range,
      role,
    }));
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载岗位协作统计失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildTalentsResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, loadTalentsData },
) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  try {
    return NextResponse.json(await deps.loadTalentsData({
      supabase: deps.createAdminClient(),
      visibleUserIds: context.scope.visibleUserIds,
      range: parsed.range,
    }));
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载达人统计失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildPersonResponse(
  request: NextRequest,
  deps = { requireAdminActor, buildPermissionContextForActor, createAdminClient, loadPersonData },
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
  if (!context.scope.visibleUserIds.includes(targetUserId)) {
    return NextResponse.json({ error: "不能查看当前权限范围外的成员" }, { status: 403 });
  }
  try {
    return NextResponse.json(await deps.loadPersonData({
      supabase: deps.createAdminClient(),
      visibleUserIds: context.scope.visibleUserIds,
      targetUserId,
      year: parsed.range.year,
      month: parsed.range.month,
    }));
  } catch (error) {
    if (error instanceof CollaborationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "加载个人协作数据失败";
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
  if (auth.actor.role !== "owner" && auth.actor.role !== "admin") {
    return NextResponse.json({ ok: false, error: "无权限补录协作归属" }, { status: 403 });
  }
  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) {
    return NextResponse.json({ ok: false, error: "用户权限范围加载失败" }, { status: 403 });
  }
  try {
    const supabase = deps.createAdminClient();
    const report = await deps.loadAttributionReport(supabase, parsed.data.reportId);
    if (!report) {
      return NextResponse.json({ ok: false, error: "日报不存在或早于协作统计起点" }, { status: 404 });
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
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "更新协作归属失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
