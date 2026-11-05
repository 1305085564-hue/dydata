import type { ModelAliasGroup } from "@/lib/ai/model-discovery";
import { requestAiConfigCommand } from "@/lib/ai-config/client-command";
import { useState, useCallback, useEffect } from "react";
import type { AvailabilityReport } from "@/lib/ai-config/availability";
import type { ProviderHealthFields } from "@/lib/ai/channel-governance";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { presentError } from "@/lib/ai-config/presentation";

export const AI_MODEL_BATCH_TIMEOUT_MS = 120_000;
export const AI_MODEL_BATCH_TIMEOUT_MESSAGE = "检测耗时较长，已中断";

export type AiProvider = {
  id: string;
  name: string;
  description: string | null;
  base_url: string;
  is_enabled: boolean;
  global_is_enabled?: boolean | null;
  priority: number;
};

export type AiProviderKey = ProviderHealthFields & {
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  available_models?: string[];
  manual_sleep_until?: string | null;
  id: string;
  provider_id: string;
  label: string;
  priority: number;
  is_enabled: boolean;
  unhealthy_until: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
  api_key_masked?: string;
  created_at: string;
  updated_at: string;
};

export type AiProviderKeyModel = ProviderHealthFields & {
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  sort_order?: number;
  id: string;
  key_id: string;
  model_id: string;
  display_name: string | null;
  is_enabled: boolean;
  global_is_enabled?: boolean | null;
  created_at: string;
  updated_at?: string;
  consecutive_failures?: number;
  unhealthy_until?: string | null;
  last_failure_at?: string | null;
  last_success_at?: string | null;
  last_error_message?: string | null;
  last_failure_scope?: "model" | "key" | null;
};

export type KeyModelInventoryItem = {
  modelId: string;
  displayName: string | null;
  isEnabled: boolean;
  isGlobalActive: boolean;
  isNewlyDiscovered: boolean;
};

export type StaleModelCheck = {
  modelId: string;
  status: "confirmed_unavailable" | "unknown";
  reason?: string;
};

export type SyncModelReconciliation = {
  status: "verified" | "unknown";
  availableModelIds?: string[];
  candidateModelIds: string[];
  verifiedUnavailableModelIds: string[];
  unknownModelIds: string[];
  checks?: StaleModelCheck[];
};

export type SyncKeyModelsResult = {
  modelGroups: ModelAliasGroup[];
  keyId: string;
  allModels: KeyModelInventoryItem[];
  newCount?: number;
  reconciliation?: SyncModelReconciliation;
};

export type KeyModelTestResult = {
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  modelId: string;
  ok: boolean;
  latencyMs?: number | null;
  error?: string | null;
};

export type AiModelTestResult = { ok: boolean; latencyMs?: number; message?: string; failureDiagnostic?: ChannelFailureDiagnostic | null };

export type KeyAllModelsTestResponse = {
  keyId: string;
  total: number;
  successCount: number;
  failureCount: number;
  emptyResult?: boolean;
  allPassed?: boolean;
  failedModelIds: string[];
  results: KeyModelTestResult[];
};

export type AiFeatureBinding = {
  id: string;
  feature_key: string;
  label: string;
  provider_key_model_id: string | null;
  model_id?: string | null;
  system_prompt: string | null;
  output_token_limit: number;
  context_message_limit: number;
  channel_settings?: Record<string, unknown> | null;
  is_enabled: boolean;
  lifecycle_state: "active" | "archived";
  archived_at: string | null;
  archived_reason: string | null;
};

export type AiFeatureControl = {
  key: string;
  label: string;
  description: string;
  group: "business" | "review" | "archived";
  routing: "binding" | "system";
  bindingId: string | null;
  providerKeyModelId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  outputTokenLimit: number;
  contextMessageLimit: number;
  ocrChannel: "baidu" | "vision";
  isEnabled: boolean;
  lifecycleState: "active" | "archived";
  archivedAt: string | null;
  archivedReason: string | null;
};

export type AiConfigBundle = {
  availability?: AvailabilityReport;
  providers: AiProvider[];
  keys: AiProviderKey[];
  models: AiProviderKeyModel[];
  featureBindings: AiFeatureBinding[];
  featureControls: AiFeatureControl[];
};

let cachedBundle: AiConfigBundle | null = null;
let listeners: Array<(bundle: AiConfigBundle | null) => void> = [];

export function useAiConfig() {
  const [bundle, setBundle] = useState<AiConfigBundle | null>(cachedBundle);
  const [isLoading, setIsLoading] = useState(!cachedBundle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (b: AiConfigBundle | null) => setBundle(b);
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  const mutate = useCallback((newBundle: AiConfigBundle | null) => {
    cachedBundle = newBundle;
    listeners.forEach((l) => l(newBundle));
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "加载配置失败");
      mutate(data as AiConfigBundle);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载配置失败";
      setError(presentError(msg, "加载配置失败"));
      if (!silent) feedbackToast.error(presentError(msg, "加载配置失败"));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [mutate]);

  const runCommand = useCallback(async (action: string, data: Record<string, unknown> = {}, entity?: "provider" | "key" | "model" | "feature_binding", timeoutMs?: number) => {
    const result = await requestAiConfigCommand(action, data, entity, timeoutMs);
    if (result.ok && result.body.availability) mutate(result.body as AiConfigBundle);
    return result;
  }, [mutate]);

  useEffect(() => {
    // Cached data is rendered immediately, then revalidated without a loading flash.
    void loadData(Boolean(cachedBundle));
  }, [loadData]);

  return { bundle, isLoading, error, loadData, runCommand };
}
