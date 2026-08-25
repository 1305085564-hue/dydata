import { useState, useCallback, useEffect } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

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
  group: "business" | "rewrite" | "review" | "archived";
  routing: "binding" | "rewrite" | "system";
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

export type RewriteModelView = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type RewriteModelRoute = {
  id: string;
  model_view_id: string;
  workflow_step_id: string | null;
  channel_id: string | null;
  provider_key_model_id: string | null;
  actual_model: string;
  priority: number;
  weight: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiConfigBundle = {
  providers: AiProvider[];
  keys: AiProviderKey[];
  models: AiProviderKeyModel[];
  featureBindings: AiFeatureBinding[];
  featureControls: AiFeatureControl[];
  rewriteModelViews: RewriteModelView[];
  rewriteModelRoutes: RewriteModelRoute[];
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
      setError(msg);
      if (!silent) feedbackToast.error(msg);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [mutate]);

  const mutateEntity = useCallback(async (
    action: "create" | "update" | "delete",
    entity: "provider" | "key" | "model" | "feature_binding" | "rewrite_model_view" | "rewrite_model_route",
    data: Record<string, unknown>
  ) => {
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
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存配置失败";
      feedbackToast.error(msg);
      return false;
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
      feedbackToast.error(err instanceof Error ? err.message : "保存业务功能失败");
      return false;
    }
  }, [mutate]);

  const testKeyConnection = useCallback(async (keyId: string, modelId?: string) => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_key", data: { key_id: keyId, model_id: modelId } }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "连通测试失败");
      }
      const { testResult, ...newBundle } = data;
      mutate(newBundle as AiConfigBundle);
      if (testResult?.ok) {
        feedbackToast.success(`连接正常 · 响应耗时 ${testResult.latencyMs}ms`);
      } else {
        feedbackToast.error(`测试未通过: ${testResult?.message || "无响应"}`);
      }
      return testResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "连通测试异常";
      feedbackToast.error(msg);
      return { ok: false, latencyMs: 0, message: msg };
    }
  }, [mutate]);

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
    feedbackToast.loading("正在检测 API 密钥...");
    const results = await Promise.all(
      cachedBundle.keys.map(async (key) => {
        const firstModel = cachedBundle?.models.find((m) => m.key_id === key.id);
        const res = await testKeyConnection(key.id, firstModel?.model_id);
        return { keyId: key.id, ok: res?.ok ?? false };
      })
    );
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    if (failCount === 0) {
      feedbackToast.success(`全池 ${okCount} 个密钥健康在线`);
    } else {
      feedbackToast.warning(`${okCount} 个正常，${failCount} 个异常`);
    }
    return { okCount, failCount };
  }, [testKeyConnection]);

  useEffect(() => {
    if (!cachedBundle) {
      void loadData();
    }
  }, [loadData]);

  return {
    bundle,
    isLoading,
    error,
    mutate,
    mutateEntity,
    saveFeatureControl: (data: Record<string, unknown>) => mutateFeatureControl("save_feature_control", data),
    setGlobalDefaultModel: (modelId: string) => mutateFeatureControl("set_global_default_model", { model_id: modelId }),
    archiveFeature: (featureKey: string) => mutateFeatureControl("archive_feature", { feature_key: featureKey }),
    restoreFeature: (featureKey: string) => mutateFeatureControl("restore_feature", { feature_key: featureKey }),
    swapKeyPriority,
    testKeyConnection,
    testAllKeys,
    refresh: () => loadData(true),
  };
}
