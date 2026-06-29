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
  system_prompt: string | null;
  output_token_limit: number;
  context_message_limit: number;
  is_enabled: boolean;
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
      feedbackToast.success("保存成功");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存配置失败";
      feedbackToast.error(msg);
      return false;
    }
  }, [mutate]);

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
    refresh: () => loadData(true),
  };
}
