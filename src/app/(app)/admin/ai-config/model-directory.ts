import type { AiConfigBundle } from "./hooks/use-ai-config";

export type ModelDirectoryEntry = {
  modelId: string;
  label: string;
  channels: { name: string; score: number }[];
};

/** 模型为主：按模型聚合全部健康渠道（顺位 = 供应商优先级 + Key 优先级，升序） */
export function buildModelDirectory(bundle: AiConfigBundle): ModelDirectoryEntry[] {
  const byModel = new Map<string, ModelDirectoryEntry>();
  for (const model of bundle.models) {
    if (!model.is_enabled) continue;
    const key = bundle.keys.find((item) => item.id === model.key_id);
    if (!key || !key.is_enabled) continue;
    const provider = bundle.providers.find((item) => item.id === key.provider_id);
    if (!provider || !provider.is_enabled) continue;
    const entry = byModel.get(model.model_id) ?? {
      modelId: model.model_id,
      label: model.display_name || model.model_id,
      channels: [],
    };
    entry.channels.push({ name: `${provider.name} / ${key.label}`, score: key.priority + provider.priority });
    byModel.set(model.model_id, entry);
  }
  return [...byModel.values()]
    .map((entry) => ({ ...entry, channels: [...entry.channels].sort((a, b) => a.score - b.score) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
