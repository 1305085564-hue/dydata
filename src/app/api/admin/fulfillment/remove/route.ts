import { NextResponse } from "next/server";

import {
  parseRemovePayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  unwrapRpc,
} from "../_shared";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseRemovePayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("remove_fulfillment_mark", {
    p_user_id: payload.data.userId,
    p_record_date: payload.data.recordDate,
  });
  const unwrapped = unwrapRpc<unknown>(result, "删除发布履约标记失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? { ok: true });
}
