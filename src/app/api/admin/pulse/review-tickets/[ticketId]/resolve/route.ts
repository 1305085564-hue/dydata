import { NextRequest, NextResponse } from "next/server";
import { isVideoReviewIssueTag } from "@/lib/video-review-tickets";
import {
  defaultTicketDependencies,
  invalidTicketId,
  loadTicketForAction,
  rawErrorCode,
  readJson,
  rpcTicketResult,
  UUID_PATTERN,
  type TicketDependencies,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function buildResolveReviewTicketResponse(
  request: NextRequest,
  ticketId: string,
  deps: TicketDependencies = defaultTicketDependencies,
): Promise<NextResponse> {
  if (!UUID_PATTERN.test(ticketId)) return invalidTicketId();
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ code: "AUTH_REQUIRED", error: auth.error }, { status: auth.status });
  const payload = await readJson(request);
  if (payload instanceof NextResponse) return payload;
  const issueTag = payload && typeof payload === "object" ? (payload as Record<string, unknown>).issueTag : undefined;
  if (!isVideoReviewIssueTag(issueTag)) {
    return NextResponse.json({ code: "INVALID_ISSUE_TAG", error: "请选择系统内置的改进标签" }, { status: 400 });
  }
  const supabase = deps.createAdminClient();
  const loaded = await loadTicketForAction(supabase, ticketId);
  if ("error" in loaded) return loaded.error ?? NextResponse.json({ code: "TICKET_LOAD_FAILED", error: "加载复盘工单失败" }, { status: 500 });
  if (loaded.ticket.assignee_id !== auth.actor.userId) {
    return NextResponse.json({ code: "ASSIGNEE_ONLY", error: "只有被派发人可以确认改进" }, { status: 403 });
  }
  if (loaded.ticket.status !== "pending") {
    return NextResponse.json({ code: "TICKET_NOT_PENDING", error: "该复盘工单已不在待办状态" }, { status: 409 });
  }
  const result = await supabase.rpc("resolve_video_review_ticket", {
    p_ticket_id: ticketId,
    p_assignee_id: auth.actor.userId,
    p_issue_tag: issueTag,
  });
  if (result.error) {
    if (rawErrorCode(result.error) === "42501") {
      return NextResponse.json({ code: "TICKET_RESOLVE_REJECTED", error: "该复盘工单已被处理，不能重复确认" }, { status: 409 });
    }
    return NextResponse.json({ code: "TICKET_RESOLVE_FAILED", error: "确认改进失败，请稍后重试" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: rpcTicketResult(result.data) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await context.params;
  return buildResolveReviewTicketResponse(request, ticketId);
}
