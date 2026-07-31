import {
  getAiFeatureCatalogGroups,
  type AiFeatureGroup,
  type AiFeatureRouting,
} from "@/lib/ai/feature-catalog";

export type AiFeatureBindingControlRow = {
  id: string;
  feature_key: string;
  provider_key_model_id: string | null;
  system_prompt: string | null;
  output_token_limit: number;
  context_message_limit: number;
  is_enabled: boolean;
  lifecycle_state: "active" | "archived" | null;
  archived_at: string | null;
  archived_reason: string | null;
};

export type AiFeatureControl = {
  key: string;
  label: string;
  description: string;
  group: AiFeatureGroup;
  routing: AiFeatureRouting;
  bindingId: string | null;
  providerKeyModelId: string | null;
  systemPrompt: string | null;
  outputTokenLimit: number;
  contextMessageLimit: number;
  isEnabled: boolean;
  lifecycleState: "active" | "archived";
  archivedAt: string | null;
  archivedReason: string | null;
};

export function buildAiFeatureControls(rows: AiFeatureBindingControlRow[]): AiFeatureControl[] {
  const bindings = new Map(rows.map((row) => [row.feature_key, row]));
  const groups = getAiFeatureCatalogGroups();
  const entries = [...groups.business, ...groups.rewrite];

  return entries.map((entry) => {
    const binding = bindings.get(entry.key);
    const archived = binding?.lifecycle_state === "archived";
    return {
      key: entry.key,
      label: entry.label,
      description: entry.description,
      group: entry.group,
      routing: entry.routing,
      bindingId: binding?.id ?? null,
      providerKeyModelId: binding?.provider_key_model_id ?? null,
      systemPrompt: binding?.system_prompt ?? null,
      outputTokenLimit: binding?.output_token_limit ?? 3600,
      contextMessageLimit: binding?.context_message_limit ?? 30,
      isEnabled: archived ? false : (binding?.is_enabled ?? true),
      lifecycleState: archived ? "archived" : "active",
      archivedAt: binding?.archived_at ?? null,
      archivedReason: archived
        ? binding?.archived_reason ?? entry.description
        : null,
    };
  });
}
