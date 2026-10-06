import {
  bumpProviderKeyFailure,
  bumpProviderKeyModelFailure,
  markProviderKeyModelSuccess,
  markProviderKeySuccess,
} from "./provider-routing";
import { classifyProviderFailure } from "./provider-health";

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
  if (scope === "key") {
    await bumpProviderKeyFailure(input.service, input.providerKeyId, input.message);
  } else if (input.providerKeyModelId) {
    await bumpProviderKeyModelFailure(input.service, input.providerKeyModelId, input.message, scope);
  }
}
