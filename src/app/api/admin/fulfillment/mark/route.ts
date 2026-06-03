import { NextResponse } from "next/server";

import {
  parseMarkPayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  unwrapRpc,
} from "../_shared";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseMarkPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("mark_fulfillment_status", {
    p_user_id: payload.data.userId,
    p_record_date: payload.data.recordDate,
    p_status: payload.data.status,
    p_reason: payload.data.reason,
  });
  const unwrapped = unwrapRpc<unknown>(result, "标记发布履约状态失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? { ok: true });
}
