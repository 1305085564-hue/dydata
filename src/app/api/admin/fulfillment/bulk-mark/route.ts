import { NextResponse } from "next/server";

import {
  parseBulkMarkPayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireVisibleUsers,
  unwrapRpc,
} from "../_shared";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseBulkMarkPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;
  const scoped = requireVisibleUsers(auth, payload.data.userIds);
  if (scoped) return scoped;

  const result = await auth.supabase.rpc("mark_fulfillment_status_batch", {
    p_user_ids: payload.data.userIds,
    p_record_date: payload.data.recordDate,
    p_status: payload.data.status,
    p_reason: payload.data.reason,
    p_marker_id: auth.actor.userId,
  });
  const unwrapped = unwrapRpc<unknown>(result, "批量标记发布履约状态失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? { ok: true });
}
