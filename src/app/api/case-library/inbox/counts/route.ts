import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../../_shared";

type CaseLibraryInboxCounts = {
  pending_review?: number;
  missing_data?: number;
  high_risk_pending?: number;
  promotion_candidates?: number;
};

type CaseLibraryInboxCountsRpcResult = {
  data: CaseLibraryInboxCounts | null;
  error: { message?: string } | null;
};

type CaseLibraryInboxCountsDeps = {
  requireCaseLibraryServiceClient: () => Promise<
    | { response: Response }
    | {
      actor: { userId: string };
      supabase: {
        rpc: (
          name: string,
          params: { p_user_id: string },
        ) => Promise<CaseLibraryInboxCountsRpcResult>;
      };
    }
  >;
  unwrapCaseLibraryRpc: (
    result: CaseLibraryInboxCountsRpcResult,
    fallbackMessage: string,
  ) => { response: Response } | { data: CaseLibraryInboxCounts | null };
};

const defaultDeps: CaseLibraryInboxCountsDeps = {
  requireCaseLibraryServiceClient: requireCaseLibraryServiceClient as unknown as CaseLibraryInboxCountsDeps["requireCaseLibraryServiceClient"],
  unwrapCaseLibraryRpc: unwrapCaseLibraryRpc as unknown as CaseLibraryInboxCountsDeps["unwrapCaseLibraryRpc"],
};

export async function buildCaseLibraryInboxCountsResponse(
  deps: CaseLibraryInboxCountsDeps = defaultDeps,
) {
  const auth = await deps.requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("case_library_inbox_counts", {
    p_user_id: auth.actor.userId,
  });
  const unwrapped = deps.unwrapCaseLibraryRpc(
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

export async function GET() {
  return buildCaseLibraryInboxCountsResponse();
}
