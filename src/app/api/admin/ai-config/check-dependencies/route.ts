import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { checkKeyDependencies } from "@/lib/ai-config/key-dependencies";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type CheckDependenciesDeps = {
  requireSystemActor: typeof requireSystemActor;
  checkKeyDependencies: typeof checkKeyDependencies;
};

export const defaultCheckDependenciesDeps: CheckDependenciesDeps = {
  requireSystemActor,
  checkKeyDependencies,
};

export async function buildCheckDependenciesResponse(
  req: NextRequest,
  deps: CheckDependenciesDeps = defaultCheckDependenciesDeps,
  observation?: Parameters<Parameters<typeof observeMutationRequest>[2]>[0],
) {
    observation?.mark("validate");
    observation?.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });

    const finish = (response: Response) => appendObservedMutationResult(response, observation);
    const auth = await deps.requireSystemActor();
    if ("error" in auth) {
      return finish(NextResponse.json({ error: auth.error }, { status: auth.status }));
    }
    const supabase = auth.supabase;

    const body = await req.json().catch(() => ({}));
    const keyId = toTrimmedString(body.keyId);

    if (!keyId) {
      return finish(NextResponse.json({ error: "缺少 keyId" }, { status: 400 }));
    }

    try {
      const result = await deps.checkKeyDependencies(supabase, keyId);
      const response = NextResponse.json(result);
      observation?.setDetail?.({ businessSucceeded: response.ok });
      if (response.ok) observation?.mark("finalize");
      return finish(response);
    } catch (error) {
      return finish(NextResponse.json(
        { error: error instanceof Error ? error.message : "检查依赖失败" },
        { status: 500 }
      ));
    }
}

export async function POST(req: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config/check-dependencies", req, async (observation) =>
    buildCheckDependenciesResponse(req, defaultCheckDependenciesDeps, observation),
  );
}
