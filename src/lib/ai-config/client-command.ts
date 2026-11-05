import { fetchWithTimeout } from "@/lib/fetch-timeout";
import type { SharedAddressImpact } from "./channel-address";
import type { AvailabilityReport } from "./availability";

export type AiConfigConfirmation = {
  requiresConfirmation: boolean;
  sharedAddressImpact?: SharedAddressImpact;
  testResult?: unknown;
  affectedBusinesses: Array<{ key: string; label: string }>;
};

export type AiConfigCommandResult =
  | { ok: true; body: Record<string, unknown> & { availability?: AvailabilityReport } }
  | ({ ok: false; status: number; error: string } & AiConfigConfirmation);

/** Preserve the server's confirmation payload; the data layer never confirms on the user's behalf. */
export async function requestAiConfigCommand(
  action: string,
  data: Record<string, unknown> = {},
  entity?: "provider" | "key" | "model" | "feature_binding",
  timeoutMs?: number,
  fetcher: typeof fetchWithTimeout = fetchWithTimeout,
): Promise<AiConfigCommandResult> {
  const response = await fetcher("/api/admin/ai-config", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(entity ? { entity } : {}),
      data: Object.fromEntries(Object.entries(data).filter(([key]) => key !== "provider_key_model_id")) }),
  }, timeoutMs);
  const body = await response.json();
  if (!response.ok || body.error) return {
    ok: false, status: response.status, error: body.error || "操作失败",
    requiresConfirmation: body.requiresConfirmation === true,
    affectedBusinesses: body.affectedBusinesses ?? [],
    ...(body.sharedAddressImpact ? {sharedAddressImpact:body.sharedAddressImpact} : {}),
    ...(body.testResult ? {testResult:body.testResult} : {}),
  };
  return { ok: true, body };
}
