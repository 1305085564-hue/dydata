import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../_shared";

type CaseLibraryInboxPayload = {
  pending_review?: unknown[];
  missing_data?: unknown[];
  high_risk_pending?: unknown[];
  promotion_candidates?: unknown[];
};

export async function GET() {
  const auth = await requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("case_library_inbox", {
    p_user_id: auth.actor.userId,
  });
  const unwrapped = unwrapCaseLibraryRpc<CaseLibraryInboxPayload>(
    result,
    "获取案例库待办失败",
  );
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? {
    pending_review: [],
    missing_data: [],
    high_risk_pending: [],
    promotion_candidates: [],
  });
}
