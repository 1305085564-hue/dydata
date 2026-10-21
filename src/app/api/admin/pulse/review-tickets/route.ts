import { NextRequest, NextResponse } from "next/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { isVideoReviewIssueTag, formatTicketTime } from "@/lib/video-review-tickets";
import {
  UUID_PATTERN,
  defaultTicketDependencies,
  firstJoinedProfileId,
  rawErrorCode,
  readJson,
  type TicketDependencies,
} from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function buildDispatchReviewTicketResponse(
  request: NextRequest,
  deps: TicketDependencies = defaultTicketDependencies,
) {
  const auth = await deps.requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) return NextResponse.json({ code: "AUTH_REQUIRED", error: auth.error }, { status: auth.status });
  if (!canAccessAdminPath("/admin/pulse", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ code: "PULSE_ACCESS_DENIED", error: "无权派发每日大盘复盘工单" }, { status: 403 });
  }

  const payload = await readJson(request);
  if (payload instanceof NextResponse) return payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ code: "INVALID_BODY", error: "请求正文必须是对象" }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId.trim() : "";
  const issueTag = body.issueTag;
  if (!UUID_PATTERN.test(videoId) || !UUID_PATTERN.test(assigneeId)) {
    return NextResponse.json({ code: "INVALID_ID", error: "作品或责任人编号格式不正确" }, { status: 400 });
  }
  if (!isVideoReviewIssueTag(issueTag)) {
    return NextResponse.json({ code: "INVALID_ISSUE_TAG", error: "复盘标记不在系统内置范围" }, { status: 400 });
  }

  const context = auth.context ?? await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ code: "SCOPE_LOAD_FAILED", error: "用户权限范围加载失败" }, { status: 403 });
  const visibleUserIds = context.scope.activeVisibleUserIds ?? context.scope.visibleUserIds;
  if (!visibleUserIds.includes(assigneeId)) {
    return NextResponse.json({ code: "ASSIGNEE_OUT_OF_SCOPE", error: "只能派发给当前数据范围内的在职成员" }, { status: 403 });
  }

  const supabase = deps.createAdminClient();
  const videoResult = await supabase
    .from("videos")
    .select("id, user_id, lifecycle_state, accounts(profile_id)")
    .eq("id", videoId)
    .maybeSingle();
  if (videoResult.error) return NextResponse.json({ code: "VIDEO_LOAD_FAILED", error: "加载作品失败" }, { status: 500 });
  if (!videoResult.data || videoResult.data.lifecycle_state !== "active") {
    return NextResponse.json({ code: "VIDEO_NOT_FOUND", error: "作品不存在或已下架" }, { status: 404 });
  }
  const ownerId = firstJoinedProfileId(videoResult.data.accounts) ?? videoResult.data.user_id;
  if (!visibleUserIds.includes(ownerId)) {
    return NextResponse.json({ code: "VIDEO_OUT_OF_SCOPE", error: "该作品不在当前数据范围内" }, { status: 403 });
  }

  const assigneeResult = await supabase
    .from("profiles")
    .select("id, membership_status")
    .eq("id", assigneeId)
    .maybeSingle();
  if (assigneeResult.error) return NextResponse.json({ code: "ASSIGNEE_LOAD_FAILED", error: "加载责任人失败" }, { status: 500 });
  if (!assigneeResult.data || assigneeResult.data.membership_status === "archived") {
    return NextResponse.json({ code: "ASSIGNEE_INACTIVE", error: "责任人已离职或停用，不能派发" }, { status: 409 });
  }

  const existingResult = await supabase
    .from("video_review_tickets")
    .select("id, created_at")
    .eq("video_id", videoId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingResult.error) return NextResponse.json({ code: "TICKET_CHECK_FAILED", error: "检查既有复盘工单失败" }, { status: 500 });
  if (existingResult.data) {
    return NextResponse.json({
      code: "TICKET_ALREADY_PENDING",
      error: `该作品已于 ${formatTicketTime(existingResult.data.created_at)} 派发，等待作者确认`,
      ticketId: existingResult.data.id,
      createdAt: existingResult.data.created_at,
    }, { status: 409 });
  }

  const insertResult = await supabase.rpc("create_video_review_ticket", {
    p_video_id: videoId,
    p_reporter_id: auth.actor.userId,
    p_assignee_id: assigneeId,
    p_issue_tag: issueTag,
  });
  if (insertResult.error) {
    if (rawErrorCode(insertResult.error) === "23505") {
      return NextResponse.json({ code: "TICKET_ALREADY_PENDING", error: "该作品已有待复盘工单，请刷新后查看" }, { status: 409 });
    }
    return NextResponse.json({ code: "TICKET_CREATE_FAILED", error: "复盘工单创建失败，请稍后重试" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: insertResult.data }, { status: 201 });
}

export async function POST(request: NextRequest) {
  return buildDispatchReviewTicketResponse(request);
}
