import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TicketDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  createAdminClient: typeof createAdminClient;
};

export const defaultTicketDependencies: TicketDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  createAdminClient,
};

export function invalidTicketId() {
  return NextResponse.json({ code: "INVALID_TICKET_ID", error: "工单编号格式不正确" }, { status: 400 });
}

export async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "请求正文不是有效 JSON" }, { status: 400 });
  }
}

export function rawErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" ? candidate.code : typeof candidate.message === "string" ? candidate.message : "";
}

export function firstJoinedProfileId(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && typeof (row as { profile_id?: unknown }).profile_id === "string"
    ? (row as { profile_id: string }).profile_id
    : null;
}

export async function loadTicketForAction(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const result = await supabase
    .from("video_review_tickets")
    .select("id, reporter_id, assignee_id, status, created_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (result.error) return { error: NextResponse.json({ code: "TICKET_LOAD_FAILED", error: "加载复盘工单失败" }, { status: 500 }) };
  if (!result.data) return { error: NextResponse.json({ code: "TICKET_NOT_FOUND", error: "复盘工单不存在" }, { status: 404 }) };
  return { ticket: result.data as { id: string; reporter_id: string; assignee_id: string; status: string; created_at: string } };
}

export function rpcTicketResult(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row : null;
}
