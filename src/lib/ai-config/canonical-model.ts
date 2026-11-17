/**
 * Returns the model identity used by routing and configuration.
 * The upstream model name remains available on model_id for provider calls.
 */
export function toCanonicalModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const canonical = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  if (!canonical) throw new Error("模型 ID 不能为空");
  return canonical;
}

export function readCanonicalModelId(modelId: string, canonicalModelId?: string | null): string {
  return canonicalModelId?.trim() || toCanonicalModelId(modelId);
}
