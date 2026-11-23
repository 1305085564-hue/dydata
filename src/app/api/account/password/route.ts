import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { buildAccountPasswordResponse, defaultAccountPasswordDeps } from "./route-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return observeMutationRequest("/api/account/password", request, async (observation) => {
    const result = await buildAccountPasswordResponse(
      request,
      defaultAccountPasswordDeps,
      observation.requestId,
      observation,
    );
    return appendObservedMutationResult(result, observation);
  });
}
