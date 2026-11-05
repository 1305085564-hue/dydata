import {
  markProviderKeyModelSuccess,
  markProviderKeySuccess,
} from "./provider-routing";
import { CHANNEL_ESCALATION_WINDOW_SECONDS, CHANNEL_ESCALATION_MODEL_COUNT, CHANNEL_ESCALATION_PAUSE_SECONDS } from "./channel-governance";
import { classifyProviderFailure, isPermanentProviderFailure, providerFailureKind } from "./provider-health";

type ServiceClient = Parameters<typeof markProviderKeySuccess>[0];

export async function recordProviderSuccess(input: {
  service: ServiceClient;
  providerKeyId: string;
  providerKeyModelId?: string | null;
}): Promise<void> {
  await markProviderKeySuccess(input.service, input.providerKeyId);
  if (input.providerKeyModelId) {
    await markProviderKeyModelSuccess(input.service, input.providerKeyModelId);
  }
}

export async function recordProviderFailure(input: {
  service: ServiceClient;
  providerKeyId: string;
  providerKeyModelId?: string | null;
  errorType: string;
  message: string;
}): Promise<void> {
  const scope = classifyProviderFailure({ errorType: input.errorType, message: input.message });
  const permanentFailure = isPermanentProviderFailure({ errorType: input.errorType, message: input.message });
  if (!input.providerKeyModelId) return;
  const { error } = await input.service.rpc("record_ai_supply_failure", {
    supply_id: input.providerKeyModelId,
    failure_scope: scope,
    failure_kind: providerFailureKind(input.errorType),
    permanent_failure: permanentFailure,
    error_message: input.message.slice(0, 500),
    window_seconds: CHANNEL_ESCALATION_WINDOW_SECONDS,
    distinct_models: CHANNEL_ESCALATION_MODEL_COUNT,
    pause_seconds: CHANNEL_ESCALATION_PAUSE_SECONDS,
  });
  if (error) throw new Error(error.message);
}
