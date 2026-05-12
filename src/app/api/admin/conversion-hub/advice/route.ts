import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseLimitParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("conversion_hub_advice_list", {
    limit_rows: parseLimitParam(request),
  });
  const unwrapped = unwrapRpc<unknown[]>(result, "获取建议动作队列失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json({ data: unwrapped.data ?? [] });
}
