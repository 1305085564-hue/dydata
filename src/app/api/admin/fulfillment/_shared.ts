import { NextResponse } from "next/server";

import { jsonBadRequest, requireAdminServiceClient, unwrapRpc } from "../cockpit/_shared";

export const FULFILLMENT_MARK_STATUSES = new Set(["leave", "waived", "absent", "confirmed_published"]);

export type FulfillmentMarkStatus = "leave" | "waived" | "absent" | "confirmed_published";

type MarkPayload = {
  userId: string;
  recordDate: string;
  status: FulfillmentMarkStatus;
  reason: string | null;
};

type RemovePayload = {
  userId: string;
  recordDate: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function readJsonBody(request: Request) {
  try {
    return { data: await request.json() };
  } catch {
    return { response: jsonBadRequest("请求体不是合法 JSON") };
  }
}

export function parseMarkPayload(input: unknown): { data: MarkPayload } | { response: NextResponse } {
  if (!isRecord(input)) return { response: jsonBadRequest("请求体必须是对象") };

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!UUID_PATTERN.test(userId)) return { response: jsonBadRequest("userId 必须是 uuid") };

  const recordDate = typeof input.recordDate === "string" ? input.recordDate.trim() : "";
  if (!isValidDate(recordDate)) return { response: jsonBadRequest("recordDate 必须是 YYYY-MM-DD") };

  const status = typeof input.status === "string" ? input.status.trim() : "";
  if (!FULFILLMENT_MARK_STATUSES.has(status)) {
    return { response: jsonBadRequest("status 必须是 leave/waived/absent/confirmed_published") };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : null;
  return { data: { userId, recordDate, status: status as FulfillmentMarkStatus, reason } };
}

export function parseRemovePayload(input: unknown): { data: RemovePayload } | { response: NextResponse } {
  if (!isRecord(input)) return { response: jsonBadRequest("请求体必须是对象") };

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!UUID_PATTERN.test(userId)) return { response: jsonBadRequest("userId 必须是 uuid") };

  const recordDate = typeof input.recordDate === "string" ? input.recordDate.trim() : "";
  if (!isValidDate(recordDate)) return { response: jsonBadRequest("recordDate 必须是 YYYY-MM-DD") };

  return { data: { userId, recordDate } };
}

export function requireOwnerOrAdminRole(auth: Awaited<ReturnType<typeof requireAdminServiceClient>>) {
  if ("response" in auth) return auth.response;
  if (auth.actor.role !== "admin" && auth.actor.role !== "owner") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return null;
}

export { requireAdminServiceClient, unwrapRpc };
