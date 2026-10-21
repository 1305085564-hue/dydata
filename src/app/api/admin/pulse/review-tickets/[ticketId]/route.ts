import { NextRequest, NextResponse } from "next/server";
import {
  defaultTicketDependencies,
  invalidTicketId,
  loadTicketForAction,
  rawErrorCode,
  rpcTicketResult,
  UUID_PATTERN,
  type TicketDependencies,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function buildDeleteReviewTicketResponse(
  _request: NextRequest,
  ticketId: string,
  deps: TicketDependencies = defaultTicketDependencies,
): Promise<NextResponse> {
  if (!UUID_PATTERN.test(ticketId)) return invalidTicketId();
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ code: "AUTH_REQUIRED", error: auth.error }, { status: auth.status });
  const supabase = deps.createAdminClient();
  const loaded = await loadTicketForAction(supabase, ticketId);
  if ("error" in loaded) return loaded.error ?? NextResponse.json({ code: "TICKET_LOAD_FAILED", error: "加载复盘工单失败" }, { status: 500 });
  if (loaded.ticket.reporter_id !== auth.actor.userId) {
    return NextResponse.json({ code: "REPORTER_ONLY", error: "只有派发人可以撤回复盘工单" }, { status: 403 });
  }
  if (loaded.ticket.status !== "pending") {
    return NextResponse.json({ code: "TICKET_NOT_PENDING", error: "该复盘工单已不在待办状态" }, { status: 409 });
  }
  const result = await supabase.rpc("delete_video_review_ticket", {
    p_ticket_id: ticketId,
    p_reporter_id: auth.actor.userId,
  });
  if (result.error) {
    if (rawErrorCode(result.error) === "42501") {
      return NextResponse.json({ code: "UNDO_WINDOW_EXPIRED", error: "5 秒撤回窗口已结束，请使用工单内撤回" }, { status: 409 });
    }
    return NextResponse.json({ code: "TICKET_DELETE_FAILED", error: "撤回复盘工单失败，请稍后重试" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: rpcTicketResult(result.data) });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await context.params;
  return buildDeleteReviewTicketResponse(request, ticketId);
}
