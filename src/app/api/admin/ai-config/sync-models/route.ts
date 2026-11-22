import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "@/lib/admin/ai-channels";
import { syncModelsForKey, type SyncError } from "@/lib/ai-config/sync-models";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { createAdminClient } from "@/lib/supabase/admin";

export type SyncModelsDeps = {
  requireSystemActor: typeof requireSystemActor;
  createAdminClient?: typeof createAdminClient;
  fetcher?: typeof fetch;
};

export const defaultSyncModelsDeps: SyncModelsDeps = { requireSystemActor, createAdminClient };

export async function buildSyncModelsResponse(
  request: NextRequest,
  deps: SyncModelsDeps = defaultSyncModelsDeps,
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const keyId = toTrimmedString(body.keyId || body.key_id);
  if (!keyId) return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });

  const modelIds = Array.isArray(body.modelIds)
    ? [...new Set((body.modelIds as unknown[]).map((id) => toTrimmedString(id)).filter(Boolean))]
    : undefined;

  try {
    // Production POST uses a service client after the system-admin guard; custom auth deps may inject their test client.
    const supabase = deps.createAdminClient
      ? deps.createAdminClient()
      : deps.requireSystemActor === requireSystemActor
        ? createAdminClient()
        : auth.supabase;
    return NextResponse.json(await syncModelsForKey(supabase, { keyId, modelIds }, deps.fetcher ?? fetch));
  } catch (error) {
    const status = typeof (error as SyncError)?.status === "number" ? (error as SyncError).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步模型列表失败" }, { status });
  }
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config/sync-models", request, async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return appendObservedMutationResult(await buildSyncModelsResponse(request, defaultSyncModelsDeps), observation);
  });
}
