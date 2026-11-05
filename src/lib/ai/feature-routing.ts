/** Business routing has exactly two sources: the selected model, then the global default. */
export function resolveFeatureModelRouting(input: {
  modelId?: string | null;
  defaultModelId?: string | null;
  isAvailable: (modelId: string) => boolean;
}) {
  const selectedModelId = input.modelId?.trim() || null;
  const defaultModelId = input.defaultModelId?.trim() || null;
  const modelIds = [...new Set([selectedModelId, defaultModelId].filter((id): id is string => Boolean(id)))]
    .filter(input.isAvailable);
  const preferredModelId = modelIds[0] ?? null;
  const status = !preferredModelId ? "outage" as const
    : selectedModelId && preferredModelId !== selectedModelId ? "fallback" as const : "normal" as const;
  return { selectedModelId, defaultModelId, preferredModelId, modelIds, status };
}
