import { requireSystemActor } from "@/lib/admin/ai-channels";
import { normalizeProviderProtocol } from "@/lib/ai/provider-protocols";
import { buildAiFeatureControls, type AiFeatureBindingControlRow } from "./feature-controls";
import { computeAvailability } from "./availability";
import { describeChannelFailure } from "./failure-diagnostic";
import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";
import { readCanonicalModelId } from "./canonical-model";

export type AiConfigClient = Awaited<ReturnType<typeof requireSystemActor>> extends infer T ? T extends {supabase:infer S} ? S : never : never;
const maskApiKeyLast4 = (value:unknown) => typeof value === "string" && value.trim() ? `***${value.trim().slice(-4)}` : "";

export async function loadAiConfig(supabase: AiConfigClient) {
  const [providersResult, keysResult, featureBindingsResult] = await Promise.all([
    supabase.from("ai_providers").select("id, name, base_url, protocol, description, is_enabled, created_at, updated_at"),
    supabase.from("ai_provider_keys").select("id, provider_id, label, api_key, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, first_failure_at, invalidated_at, manual_sleep_until, available_models, created_at, updated_at"),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, model_id, system_prompt, output_token_limit, context_message_limit, channel_settings, is_enabled, lifecycle_state, archived_at, archived_reason, created_at, updated_at"),
  ]);

  const modelsResult = await supabase
    .from("ai_provider_key_models")
    .select("*");

  const firstError =
    providersResult.error ??
    keysResult.error ??
    modelsResult.error ??
    featureBindingsResult.error;

  if (firstError) throw new Error(firstError.message);

  const normalizedProviders = (providersResult.data ?? []).map((provider) => ({
    ...provider,
    protocol: normalizeProviderProtocol((provider as { protocol?: unknown }).protocol),
    priority: 0,
  }));

  const rawModels = (modelsResult.data ?? []) as Array<Record<string, unknown>>;
  const modelsWithoutLegacyState = rawModels.map((row) => {
    const model: Record<string, unknown> = {
      ...row,
      canonical_model_id: readCanonicalModelId(
        String(row.model_id ?? ""),
        typeof row.canonical_model_id === "string" ? row.canonical_model_id : null,
      ),
    };
    delete model.global_is_enabled;
    return model;
  });
  const enabledModelIds = new Set(modelsWithoutLegacyState.filter((row) => row.is_enabled === true).map((row) => row.canonical_model_id));
  const secrets = (keysResult.data ?? []).map((key) => String(key.api_key ?? ""));
  const bundle = {
    providers: normalizedProviders,
    keys: (keysResult.data ?? []).map((row) => ({
      ...row,
      priority: 0,
      last_error_message: row.last_error_message ? sanitizeProviderErrorMessage(row.last_error_message, secrets) : null,
      failureDiagnostic: row.last_error_message ? describeChannelFailure({ message: String(row.last_error_message), secrets }) : null,
      api_key: undefined,
      api_key_masked: maskApiKeyLast4((row as { api_key?: unknown }).api_key),
    })),
    models: modelsWithoutLegacyState.map((row) => ({ ...row,
      global_is_enabled: enabledModelIds.has(row.model_id),
      last_error_message: row.last_error_message ? sanitizeProviderErrorMessage(row.last_error_message, secrets) : null,
      failureDiagnostic: row.last_error_message ? describeChannelFailure({ message: String(row.last_error_message), secrets }) : null,
    })),
    featureBindings: (featureBindingsResult.data ?? []).map((binding) => ({
      ...binding,
      model_id: binding.model_id ? readCanonicalModelId(String(binding.model_id)) : binding.model_id,
      provider_key_model_id: null,
    })),
    featureControls: buildAiFeatureControls((featureBindingsResult.data ?? []) as AiFeatureBindingControlRow[]),
  };
  return { ...bundle, availability: computeAvailability({
    providers: normalizedProviders,
    keys: keysResult.data ?? [],
    models: modelsWithoutLegacyState as never,
    featureControls: bundle.featureControls,
    defaultBinding: bundle.featureBindings.find((binding) => binding.feature_key === "default") ?? null,
  }) };
}
