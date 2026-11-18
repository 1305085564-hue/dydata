import { NextResponse } from "next/server";

import { requireSignedInUser } from "@/app/api/production/_shared";
import { withdrawPendingExemptionRequests } from "@/lib/exemption-withdraw";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export const defaultWithdrawExemptionDeps: { requireSignedInUser: typeof requireSignedInUser } = {
  requireSignedInUser,
};

/** 员工撤回自己待审批的请假/免交申请；用员工自己的客户端，权限由数据库行级规则兜底。 */
export async function buildWithdrawExemptionResponse(
  deps: { requireSignedInUser: typeof requireSignedInUser } = defaultWithdrawExemptionDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  observation?.mark("auth");
  const auth = await deps.requireSignedInUser();
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });

  observation?.mark("write-request");
  const result = await withdrawPendingExemptionRequests(auth.supabase, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  observation?.mark("finalize");
  return NextResponse.json({ withdrawn: result.withdrawn, skippedReviewed: result.skippedReviewed });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/exemptions/withdraw", request, async (observation) =>
    appendObservedMutationResult(
      await buildWithdrawExemptionResponse(defaultWithdrawExemptionDeps, observation),
      observation,
    ),
  );
}
