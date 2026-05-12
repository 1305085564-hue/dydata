import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseLimitParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("admin_pending_violations", {
    limit_rows: parseLimitParam(request),
  });
  const unwrapped = unwrapRpc<unknown[]>(result, "获取待审违规失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json({ data: unwrapped.data ?? [] });
}
