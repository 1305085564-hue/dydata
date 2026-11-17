import { getModelDisplayName } from "@/lib/ai/model-families";
import { readCanonicalModelId, toCanonicalModelId } from "@/lib/ai-config/canonical-model";

export type ModelAliasGroup = {
  displayName: string;
  /** Canonical model identity sent by admin configuration actions. */
  recommendedModelId: string;
  /** Raw upstream spellings, shown as diagnostic details only. */
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
    const key = toCanonicalModelId(modelId);
    const variants = groups.get(key) ?? [];
    if (!variants.includes(modelId)) variants.push(modelId);
    groups.set(key, variants);
  }
  return [...groups.values()].map((variants) => ({
    displayName: getModelDisplayName(toCanonicalModelId(variants[0])),
    recommendedModelId: toCanonicalModelId(variants[0]),
    modelIds: variants,
  }));
}

export type ModelChannelDiscoveryInput = {
  providers: Array<{ id: string; name: string; is_enabled: boolean }>;
  keys: Array<{ id: string; provider_id: string; label: string; is_enabled: boolean; available_models?: unknown }>;
  models: Array<{ id: string; key_id: string; model_id: string; canonical_model_id?: string | null; is_enabled: boolean }>;
};

export type ModelChannelCandidate = {
  modelId: string;
  upstreamModelId: string;
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
  const canonicalModelId = toCanonicalModelId(modelId);
  // gate:transient-map this provider index is built for one candidate lookup and discarded on return.
  const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const candidates: ModelChannelCandidate[] = [];
  for (const key of input.keys) {
    const upstreamModelId = (Array.isArray(key.available_models) ? key.available_models : [])
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
      .filter((value) => readCanonicalModelId(value) === canonicalModelId)
      .sort((left, right) => Number(left.includes("/")) - Number(right.includes("/")) || left.localeCompare(right))[0];
    if (!upstreamModelId) continue;
    const existing = input.models.find((model) => model.key_id === key.id && readCanonicalModelId(model.model_id, model.canonical_model_id) === canonicalModelId);
    if (existing?.is_enabled) continue;
    const provider = providerById.get(key.provider_id);
    if (!provider) continue;
    candidates.push({
      modelId: canonicalModelId,
      upstreamModelId,
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
