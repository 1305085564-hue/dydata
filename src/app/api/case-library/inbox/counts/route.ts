import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../../_shared";

type CaseLibraryInboxCounts = {
  pending_review?: number;
  missing_data?: number;
  high_risk_pending?: number;
  promotion_candidates?: number;
};

export async function GET() {
  const auth = await requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("case_library_inbox_counts", {
    p_user_id: auth.actor.userId,
  });
  const unwrapped = unwrapCaseLibraryRpc<CaseLibraryInboxCounts>(
    result,
    "获取案例库待办计数失败",
  );
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? {
    pending_review: 0,
    missing_data: 0,
    high_risk_pending: 0,
    promotion_candidates: 0,
  });
}
