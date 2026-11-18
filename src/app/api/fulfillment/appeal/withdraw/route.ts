import { NextResponse } from "next/server";

import { requireSignedInUser } from "@/app/api/production/_shared";
import { withdrawPendingFulfillmentAppeal } from "@/lib/fulfillment-appeal-withdraw";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WithdrawAppealDeps = {
  requireSignedInUser: typeof requireSignedInUser;
  createAdminClient: typeof createAdminClient;
};

export const defaultWithdrawAppealDeps: WithdrawAppealDeps = { requireSignedInUser, createAdminClient };

/** 员工撤回自己待审批的补交申请。员工对申请表没有写权限，由服务端用管理客户端执行，并在此校验"本人 + 仍待审"。 */
export async function buildWithdrawAppealResponse(
  request: Request,
  deps: WithdrawAppealDeps = defaultWithdrawAppealDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  observation?.mark("auth");
  const auth = await deps.requireSignedInUser();
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });

  observation?.mark("validate");
  const body = (await request.json().catch(() => null)) as { appealId?: unknown } | null;
  const appealId = typeof body?.appealId === "string" ? body.appealId.trim() : "";
  if (!UUID_PATTERN.test(appealId)) return NextResponse.json({ error: "appealId 必须是 uuid" }, { status: 400 });

  observation?.mark("write-request");
  const result = await withdrawPendingFulfillmentAppeal({ admin: deps.createAdminClient(), userId: auth.user.id, appealId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  observation?.mark("finalize");
  return NextResponse.json({ withdrawn: true, todosClosed: result.todosClosed });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/fulfillment/appeal/withdraw", request, async (observation) =>
    appendObservedMutationResult(await buildWithdrawAppealResponse(request, defaultWithdrawAppealDeps, observation), observation),
  );
}
