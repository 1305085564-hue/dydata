import { getModelDisplayName } from "@/lib/ai/model-families";

export type ModelAliasGroup = {
  displayName: string;
  recommendedModelId: string;
  modelIds: string[];
};

export function normalizeModelIdAlias(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/[._-]+/g, "-");
}

export function isModelConfirmedUnavailable(status: number, responseBody: string): boolean {
  if (status === 404) return true;
  if (status === 429) return false;
  const body = responseBody.toLowerCase();
  return /\bmodel(?:[_ -]?id)?[_ -](?:not[_ -]?found|does[_ -]?not[_ -]?exist)\b/.test(body)
    || /\bmodel(?:[_ -]?id)?\s+(?:is\s+)?not found\b/.test(body)
    || /\bmodel\s+[`'"“][^`'"”]{1,120}[`'"”]\s+(?:is\s+)?(?:not found|does not exist|doesn't exist|doesnt exist)\b/.test(body)
    || /\bunknown model\b|\bno such model\b/.test(body)
    || /模型(?:不存在|已不存在)|找不到模型/.test(responseBody);
}

/** Groups only case and separator variants; date and model-variant suffixes stay distinct. */
export function groupModelIdAliases(modelIds: string[]): ModelAliasGroup[] {
  // gate:transient-map this aggregation exists only for one grouping call and is discarded on return.
  const groups = new Map<string, string[]>();
  for (const rawId of modelIds) {
    const modelId = rawId.trim();
    if (!modelId) continue;
    const key = normalizeModelIdAlias(modelId);
    const variants = groups.get(key) ?? [];
    if (!variants.includes(modelId)) variants.push(modelId);
    groups.set(key, variants);
  }
  return [...groups.values()].map((variants) => ({
    displayName: getModelDisplayName(variants[0]),
    recommendedModelId: variants[0],
    modelIds: variants,
  }));
}

export type ModelChannelDiscoveryInput = {
  providers: Array<{ id: string; name: string; is_enabled: boolean }>;
  keys: Array<{ id: string; provider_id: string; label: string; is_enabled: boolean; available_models?: unknown }>;
  models: Array<{ id: string; key_id: string; model_id: string; is_enabled: boolean }>;
};

export type ModelChannelCandidate = {
  modelId: string;
  keyId: string;
  keyLabel: string;
  providerId: string;
  providerName: string;
  providerEnabled: boolean;
  keyEnabled: boolean;
  existingSupplyId: string | null;
  requiresProbe: true;
};

/** Presence in available_models makes a candidate to probe, not proof of a live test. */
export function findModelChannelCandidates(input: ModelChannelDiscoveryInput, modelId: string): ModelChannelCandidate[] {
  // gate:transient-map this provider index is built for one candidate lookup and discarded on return.
  const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const candidates: ModelChannelCandidate[] = [];
  for (const key of input.keys) {
    if (!Array.isArray(key.available_models) || !key.available_models.includes(modelId)) continue;
    const existing = input.models.find((model) => model.key_id === key.id && model.model_id === modelId);
    if (existing?.is_enabled) continue;
    const provider = providerById.get(key.provider_id);
    if (!provider) continue;
    candidates.push({
      modelId,
      keyId: key.id,
      keyLabel: key.label,
      providerId: provider.id,
      providerName: provider.name,
      providerEnabled: provider.is_enabled,
      keyEnabled: key.is_enabled,
      existingSupplyId: existing?.id ?? null,
      requiresProbe: true,
    });
  }
  return candidates;
}
