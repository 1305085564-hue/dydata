import type { ModelAliasGroup } from "@/lib/ai/model-discovery";
import type { AiProviderProtocol } from "@/lib/ai/provider-protocols";
import { requestAiConfigCommand } from "@/lib/ai-config/client-command";
import { useState, useCallback, useEffect, useRef } from "react";
import type { AvailabilityReport } from "@/lib/ai-config/availability";
import type { ProviderHealthFields } from "@/lib/ai/channel-governance";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { presentError } from "@/lib/ai-config/presentation";

export const AI_MODEL_BATCH_TIMEOUT_MS = 120_000;
export const AI_MODEL_BATCH_TIMEOUT_MESSAGE = "检测耗时较长，已中断";
export const AI_DETECTION_REFRESH_INTERVAL_MS = 4_000;

type LoadAiConfigData = (silent?: boolean, notifyOnError?: boolean) => Promise<boolean>;

export type DetectionRefreshOptions = {
  loadData: LoadAiConfigData;
  onWindowEnd: () => void;
  onReadError?: () => void;
  intervalMs?: number;
  windowMs?: number;
};

/**
 * 只在一次检测生命周期内读取已落库状态：短周期、读取不重叠、到窗口上限或 stop 后停止。
 * 不建立全站常驻轮询；onWindowEnd 只回调一次。
 */
export function startDetectionRefresh(options: DetectionRefreshOptions): { stop: () => void } {
  const intervalMs = options.intervalMs ?? AI_DETECTION_REFRESH_INTERVAL_MS;
  const windowMs = options.windowMs ?? AI_MODEL_BATCH_TIMEOUT_MS;
  const deadline = Date.now() + windowMs;
  let stopped = false;
  let inFlight = false;
  let readErrorNotified = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = async () => {
    if (stopped) return;
    if (Date.now() >= deadline) {
      stop();
      options.onWindowEnd();
      return;
    }
    if (inFlight) return;
    inFlight = true;
    try {
      const ok = await options.loadData(true);
      if (!ok && !readErrorNotified) {
        readErrorNotified = true;
        options.onReadError?.();
      }
    } finally {
      inFlight = false;
    }
  };

  timer = setInterval(() => { void tick(); }, intervalMs);
  void tick();
  return { stop };
}

export type AiProvider = {
  id: string;
  name: string;
  description: string | null;
  base_url: string;
  protocol?: AiProviderProtocol;
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
  canonical_model_id?: string | null;
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
  /** Canonical model identity; raw upstream IDs are only in modelGroups.modelIds. */
  modelId: string;
  displayName: string | null;
  isEnabled: boolean;
  isGlobalActive: boolean;
  isNewlyDiscovered: boolean;
};

export type SyncKeyModelsResult = {
  modelGroups: ModelAliasGroup[];
  keyId: string;
  allModels: KeyModelInventoryItem[];
  newCount?: number;
  removedCount?: number;
  removedModelIds?: string[];
  removedEnabledCount?: number;
  removedEnabledModelIds?: string[];
  lostBusinesses?: Array<{ key: string; label: string; modelId?: string | null }>;
};

export type KeyModelTestResult = {
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  modelId: string;
  ok: boolean;
  latencyMs?: number | null;
  error?: string | null;
  stateWriteError?: string | null;
};

export type AiModelTestResult = { ok: boolean; latencyMs?: number; message?: string; failureDiagnostic?: ChannelFailureDiagnostic | null; stateWriteError?: string | null };

export type KeyAllModelsTestResponse = {
  keyId: string;
  total: number;
  successCount: number;
  failureCount: number;
  emptyResult?: boolean;
  allPassed?: boolean;
  failedModelIds: string[];
  results: KeyModelTestResult[];
  stateWriteError?: string | null;
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

/**
 * 页面内多个 useAiConfig 会在同一时刻挂载（外壳、各面板、弹窗都各调一次）。
 * 挂载自动读取走共享请求 + 短窗口去重，整屏只发一次 GET；显式刷新与命令后读取
 * 仍走强制新请求，保证「刷新就能拿到最新状态」的语义不变。
 */
export const AI_CONFIG_MOUNT_DEDUPE_WINDOW_MS = 1_000;

export type AiConfigStore = {
  getBundle: () => AiConfigBundle | null;
  subscribe: (listener: (bundle: AiConfigBundle | null) => void) => () => void;
  mutate: (bundle: AiConfigBundle | null) => void;
  /** 挂载自动读取：共享进行中的请求；短窗口内已读过则返回 null，直接用缓存。 */
  loadForMount: () => Promise<AiConfigBundle | null>;
  /** 显式刷新：总是发起一次新的 GET，不复用进行中的请求或缓存。 */
  loadFresh: () => Promise<AiConfigBundle>;
};

export function createAiConfigStore(
  fetchBundle: () => Promise<AiConfigBundle>,
  mountDedupeWindowMs = AI_CONFIG_MOUNT_DEDUPE_WINDOW_MS,
): AiConfigStore {
  let cachedBundle: AiConfigBundle | null = null;
  let listeners: Array<(bundle: AiConfigBundle | null) => void> = [];
  let inFlight: Promise<AiConfigBundle> | null = null;
  let lastSettledAt = 0;

  const mutate = (bundle: AiConfigBundle | null) => {
    cachedBundle = bundle;
    lastSettledAt = Date.now();
    listeners.forEach((l) => l(bundle));
  };

  const subscribe = (listener: (bundle: AiConfigBundle | null) => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  };

  const startShared = (): Promise<AiConfigBundle> => {
    if (inFlight) return inFlight;
    const promise = fetchBundle();
    inFlight = promise;
    const settle = () => {
      if (inFlight === promise) inFlight = null;
      lastSettledAt = Date.now();
    };
    promise.then(settle, settle);
    return promise;
  };

  const loadForMount = async (): Promise<AiConfigBundle | null> => {
    if (!inFlight && cachedBundle && Date.now() - lastSettledAt < mountDedupeWindowMs) {
      return null;
    }
    return startShared();
  };

  const loadFresh = (): Promise<AiConfigBundle> => fetchBundle();

  return { getBundle: () => cachedBundle, subscribe, mutate, loadForMount, loadFresh };
}

async function fetchAiConfigBundle(): Promise<AiConfigBundle> {
  const res = await fetchWithTimeout("/api/admin/ai-config");
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "加载配置失败");
  return data as AiConfigBundle;
}

const aiConfigStore = createAiConfigStore(fetchAiConfigBundle);

export function useAiConfig() {
  const [bundle, setBundle] = useState<AiConfigBundle | null>(aiConfigStore.getBundle());
  const [isLoading, setIsLoading] = useState(!aiConfigStore.getBundle());
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => aiConfigStore.subscribe(setBundle), []);

  const mutate = useCallback((newBundle: AiConfigBundle | null) => {
    aiConfigStore.mutate(newBundle);
  }, []);

  const loadData = useCallback(async (silent = false, notifyOnError = false): Promise<boolean> => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await aiConfigStore.loadFresh();
      // 只让最后发起的那次读取落到页面，避免检测中旧快照晚到覆盖新状态。
      if (seq === requestSeq.current) mutate(data);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载配置失败";
      const friendly = presentError(msg, "加载配置失败");
      if (seq === requestSeq.current) setError(friendly);
      if (!silent || notifyOnError) feedbackToast.error(friendly);
      return false;
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [mutate]);

  const loadForMount = useCallback(async (silent: boolean) => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await aiConfigStore.loadForMount();
      if (data && seq === requestSeq.current) mutate(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载配置失败";
      const friendly = presentError(msg, "加载配置失败");
      if (seq === requestSeq.current) setError(friendly);
      if (!silent) feedbackToast.error(friendly);
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
    // 缓存数据先渲染，挂载读取只做一次共享校验，不产生加载闪烁。
    void loadForMount(aiConfigStore.getBundle() != null);
  }, [loadForMount]);

  return { bundle, isLoading, error, loadData, runCommand };
}
