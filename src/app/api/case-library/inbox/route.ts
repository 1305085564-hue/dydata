import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../_shared";

type CaseLibraryInboxPayload = {
  pending_review?: unknown[];
  violation_pending_review?: unknown[];
  knowledge_pending_enrichment?: unknown[];
  knowledge_needs_revision?: unknown[];
  pending_review_conversion?: unknown[];
  missing_data?: unknown[];
  high_risk_pending?: unknown[];
  promotion_candidates?: unknown[];
};

type CaseLibraryInboxRpcResult = {
  data: CaseLibraryInboxPayload | null;
  error: { message?: string } | null;
};

type CaseLibraryInboxDeps = {
  requireCaseLibraryServiceClient: () => Promise<
    | { response: Response }
    | {
      actor: { userId: string };
      supabase: {
        rpc: (
          name: string,
          params: { p_user_id: string },
        ) => Promise<CaseLibraryInboxRpcResult>;
      };
    }
  >;
  unwrapCaseLibraryRpc: (
    result: CaseLibraryInboxRpcResult,
    fallbackMessage: string,
  ) => { response: Response } | { data: CaseLibraryInboxPayload | null };
};

const defaultDeps: CaseLibraryInboxDeps = {
  requireCaseLibraryServiceClient: requireCaseLibraryServiceClient as unknown as CaseLibraryInboxDeps["requireCaseLibraryServiceClient"],
  unwrapCaseLibraryRpc: unwrapCaseLibraryRpc as unknown as CaseLibraryInboxDeps["unwrapCaseLibraryRpc"],
};

export async function buildCaseLibraryInboxResponse(
  deps: CaseLibraryInboxDeps = defaultDeps,
) {
  const auth = await deps.requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("case_library_inbox", {
    p_user_id: auth.actor.userId,
  });
  const unwrapped = deps.unwrapCaseLibraryRpc(
    result,
    "获取案例库待办失败",
  );
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? {
    pending_review: [],
    violation_pending_review: [],
    knowledge_pending_enrichment: [],
    knowledge_needs_revision: [],
    pending_review_conversion: [],
    missing_data: [],
    high_risk_pending: [],
    promotion_candidates: [],
  });
}

export async function GET() {
  return buildCaseLibraryInboxResponse();
}
