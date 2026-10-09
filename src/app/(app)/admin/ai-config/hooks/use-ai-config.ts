import { useState, useCallback, useEffect } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { formatLatency, presentError } from "@/lib/ai-config/presentation";

export type AiProvider = {
  id: string;
  name: string;
  description: string | null;
  base_url: string;
  is_enabled: boolean;
  priority: number;
};

export type AiProviderKey = {
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

export type AiProviderKeyModel = {
  id: string;
  key_id: string;
  model_id: string;
  display_name: string | null;
  is_enabled: boolean;
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

export type SyncKeyModelsResult = {
  keyId: string;
  allModels: KeyModelInventoryItem[];
  newCount?: number;
};

export type KeyModelTestResult = {
  modelId: string;
  ok: boolean;
  latencyMs?: number | null;
  error?: string | null;
};

export type KeyAllModelsTestResponse = {
  keyId: string;
  total: number;
  successCount: number;
  failureCount: number;
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
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

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
      setLastLoadedAt(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载配置失败";
      setError(presentError(msg, "加载配置失败"));
      if (!silent) feedbackToast.error(presentError(msg, "加载配置失败"));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [mutate]);

  const mutateEntity = useCallback(async (
    action: "create" | "update" | "delete",
    entity: "provider" | "key" | "model" | "feature_binding",
    data: Record<string, unknown>
  ): Promise<{ ok: boolean; affectedCount?: number }> => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entity, data }),
      });
      const responseData = await res.json();
      if (!res.ok || responseData.error) {
        throw new Error(responseData.error || `操作失败: ${action} ${entity}`);
      }
      mutate(responseData as AiConfigBundle);
      return { ok: true, affectedCount: responseData.affectedCount ?? 0 };
    } catch (err) {
      const msg = presentError(err instanceof Error ? err.message : "", "保存配置失败");
      feedbackToast.error(msg);
      return { ok: false, affectedCount: 0 };
    }
  }, [mutate]);

  const mutateFeatureControl = useCallback(async (
    action: "save_feature_control" | "archive_feature" | "restore_feature" | "set_global_default_model",
    data: Record<string, unknown>,
  ) => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const responseData = await res.json();
      if (!res.ok || responseData.error) {
        throw new Error(responseData.error || "保存业务功能失败");
      }
      mutate(responseData as AiConfigBundle);
      return true;
    } catch (err) {
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "保存业务功能失败"));
      return false;
    }
  }, [mutate]);

  const testKeyConnection = useCallback(async (keyId: string, modelId?: string, testMode: "text" | "vision" = "text") => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_key", data: { key_id: keyId, model_id: modelId, test_mode: testMode } }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "连通测试失败");
      }
      const { testResult, ...newBundle } = data;
      mutate(newBundle as AiConfigBundle);
      if (testResult?.ok) {
        feedbackToast.success(`连接正常 · 响应耗时 ${formatLatency(testResult.latencyMs)}`);
      } else {
        feedbackToast.error(`测试未通过: ${testResult?.message || "无响应"}`);
      }
      return testResult;
    } catch (err) {
      const msg = presentError(err instanceof Error ? err.message : "", "连通测试异常");
      feedbackToast.error(msg);
      return { ok: false, latencyMs: 0, message: msg };
    }
  }, [mutate]);

  const testKeyModel = useCallback(async (keyId: string, modelId: string) => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_key_model", data: { key_id: keyId, model_id: modelId } }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "模型连通测试失败");
      const { testResult, ...newBundle } = data;
      mutate(newBundle as AiConfigBundle);
      if (testResult?.ok) {
        feedbackToast.success(`模型连接正常 · 响应耗时 ${formatLatency(testResult.latencyMs)}`);
      } else {
        feedbackToast.error(`模型测试未通过：${testResult?.message || "无响应"}`);
      }
      return testResult;
    } catch (err) {
      const msg = presentError(err instanceof Error ? err.message : "", "模型连通测试异常");
      feedbackToast.error(msg);
      return { ok: false, message: msg };
    }
  }, [mutate]);

  const testKeyAllModels = useCallback(async (keyId: string): Promise<KeyAllModelsTestResponse> => {
    const res = await fetchWithTimeout("/api/admin/ai-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test_key_all_models", data: { key_id: keyId } }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "渠道模型检测失败");
    return data as KeyAllModelsTestResponse;
  }, []);

  const testAllKeysAllModels = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/ai-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test_all_keys_all_models" }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "全部模型检测失败");
    return data;
  }, []);

  const swapKeyPriority = useCallback(async (
    keyId: string,
    targetKeyId: string,
    keyPriority: number,
    targetPriority: number,
  ) => {
    // 乐观更新本地 cachedBundle
    if (cachedBundle) {
      const nextKeys = cachedBundle.keys.map((k) => {
        if (k.id === keyId) return { ...k, priority: targetPriority };
        if (k.id === targetKeyId) return { ...k, priority: keyPriority };
        return k;
      });
      mutate({ ...cachedBundle, keys: nextKeys });
    }

    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_key_priority",
          data: { key_id: keyId, target_key_id: targetKeyId, key_priority: keyPriority, target_priority: targetPriority },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "交换顺位失败");
      mutate(data as AiConfigBundle);
      return true;
    } catch (error) {
      void loadData(true);
      feedbackToast.error(error instanceof Error ? error.message : "交换顺位失败");
      return false;
    }
  }, [mutate, loadData]);

  const testAllKeys = useCallback(async () => {
    if (!cachedBundle || cachedBundle.keys.length === 0) {
      feedbackToast.error("当前暂无可测试的 API Key");
      return { okCount: 0, failCount: 0 };
    }
    const loadingId = feedbackToast.loading("正在检测 API 密钥...");
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test_all_keys" }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "全部检测异常，请稍后重试");
      setLastLoadedAt(Date.now());
      const results = data.results ?? [];
      const okCount = results.filter((r: { ok: boolean }) => r.ok).length;
      const failCount = results.length - okCount;

      if (failCount === 0) {
        feedbackToast.success(`全池 ${okCount} 个密钥健康在线`);
      } else {
        feedbackToast.warning(`${okCount} 个正常，${failCount} 个异常`);
      }
      return { okCount, failCount, results, total: data.total ?? results.length };
    } catch (err) {
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "全部检测异常，请稍后重试"));
      return { okCount: 0, failCount: 0 };
    } finally {
      feedbackToast.dismiss(loadingId);
    }
  }, []);

  useEffect(() => {
    // Cached data is rendered immediately, then revalidated without a loading flash.
    void loadData(Boolean(cachedBundle));
  }, [loadData]);

  return {
    bundle,
    isLoading,
    error,
    loadData,
    mutate,
    mutateEntity,
    saveFeatureControl: (data: Record<string, unknown>) => mutateFeatureControl("save_feature_control", data),
    setGlobalDefaultModel: (modelId: string) => mutateFeatureControl("set_global_default_model", { model_id: modelId }),
    archiveFeature: (featureKey: string) => mutateFeatureControl("archive_feature", { feature_key: featureKey }),
    restoreFeature: (featureKey: string) => mutateFeatureControl("restore_feature", { feature_key: featureKey }),
    swapKeyPriority,
    testKeyConnection,
    testKeyModel,
    testKeyAllModels,
    testAllKeysAllModels,
    testAllKeys,
    lastLoadedAt,
    syncKeyModels: async (keyId: string): Promise<{ ok: true; data: SyncKeyModelsResult } | { ok: false; error: string }> => {
      try {
        const res = await fetchWithTimeout("/api/admin/ai-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_key_models", data: { key_id: keyId } }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "同步模型列表失败");
        }
        const { syncResult, ...newBundle } = data;
        mutate(newBundle as AiConfigBundle);
        return { ok: true, data: syncResult as SyncKeyModelsResult };
      } catch (err) {
        const msg = presentError(err instanceof Error ? err.message : "", "同步模型列表失败");
        return { ok: false, error: msg };
      }
    },
    setKeyModelSelection: async (keyId: string, modelIds: string[]) => {
      try {
        const res = await fetchWithTimeout("/api/admin/ai-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_key_model_selection", data: { key_id: keyId, model_ids: modelIds } }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "保存模型勾选失败");
        }
        const newBundle = { ...data };
        delete (newBundle as Record<string, unknown>).syncResult;
        mutate(newBundle as AiConfigBundle);
        return true;
      } catch (err) {
        const msg = presentError(err instanceof Error ? err.message : "", "保存模型勾选失败");
        feedbackToast.error(msg);
        return false;
      }
    },
    checkDependencies: async (keyId: string): Promise<{ ok: boolean; criticalBindings: Array<{ id: string; key: string; label: string; modelId: string | null }>; affectedBindings: Array<{ id: string; key: string; label: string; modelId: string | null }> }> => {
      try {
        const res = await fetchWithTimeout("/api/admin/ai-config/check-dependencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyId }),
        });
        const data = await res.json();
        return {
          ok: true,
          criticalBindings: (data.criticalBindings ?? []) as Array<{ id: string; key: string; label: string; modelId: string | null }>,
          affectedBindings: (data.affectedBindings ?? []) as Array<{ id: string; key: string; label: string; modelId: string | null }>,
        };
      } catch {
        return { ok: false, criticalBindings: [], affectedBindings: [] };
      }
    },
    syncKeyModelsAuto: async (keyId: string, modelIds?: string[]) => {
      try {
        const res = await fetchWithTimeout("/api/admin/ai-config/sync-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyId, modelIds }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "同步模型列表失败");
        await loadData(true);
        return data as { ok: boolean; newModels: Array<{ id: string; model_id: string; displayName: string }> };
      } catch (err) {
        const msg = presentError(err instanceof Error ? err.message : "", "同步模型列表失败");
        feedbackToast.error(msg);
        return null;
      }
    },
    refresh: async () => {
      await loadData(true);
      return cachedBundle;
    },
  };
}
