import { createAdminClient } from "@/lib/supabase/admin";
import { BoundedTtlCache } from "@/lib/cache-policy";
import { resolveFeatureModelRouting } from "./feature-routing";
import { getProviderKeyModelConfig, listRankedProviderKeyModels, type ProviderKeyModelConfig } from "./provider-routing";

export type ChannelConfig = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string | null;
  providerKeyModelId?: string | null;
  providerKeyId?: string | null;
  source: "env" | "provider_key_model";
  requiresProbe?: boolean;
  cooldownUntil?: string | null;
};

type FeatureConfig = {
  featureKey: string;
  providerKeyModelId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  isEnabled: boolean;
  lifecycleState: "active" | "archived";
};

type AiFeatureBindingRow = {
  feature_key: string;
  provider_key_model_id: string | null;
  model_id?: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
  lifecycle_state?: "active" | "archived" | null;
};

const CHANNEL_CACHE_TTL_MS = 60_000;

// 公共AI配置快照，进程内最多1份，60秒过期；配置写入/测试resetCache主动失效。
// 不缓存凭据或失败；读取失败报错，过期后重新查库。
const featureCache = new BoundedTtlCache<FeatureConfig[]>({ scope: "public", ttlMs: CHANNEL_CACHE_TTL_MS, maxEntries: 1, name: "ai-feature-configs" });

function getEnvFlag(name: string) {
  return process.env[name]?.trim().toLowerCase();
}

function isDbChannelModeEnabled() {
  return getEnvFlag("AI_CHANNELS_ENABLED") !== "false";
}

function getChannelFromEnv(): ChannelConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;

  return {
    name: "env-default",
    baseUrl,
    apiKey,
    model: process.env.AI_MODEL?.trim() || null,
    source: "env",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _serviceClient: any = null;

function getServiceSupabaseClient() {
  if (_serviceClient) return _serviceClient;
  try { return (_serviceClient = createAdminClient()); } catch { return null; }
}

function mapFeatureBinding(row: AiFeatureBindingRow): FeatureConfig {
  return {
    featureKey: row.feature_key,
    providerKeyModelId: null,
    modelId: row.model_id ?? null,
    systemPrompt: row.system_prompt,
    isEnabled: row.is_enabled,
    lifecycleState: row.lifecycle_state === "archived" ? "archived" : "active",
  };
}

async function getFeatureConfig(featureKey: string): Promise<FeatureConfig | null> {
  const cached = featureCache.get("bindings");
  if (cached) return cached.find(config => config.featureKey === featureKey) ?? null;
  const supabase = getServiceSupabaseClient();
  if (!supabase) return null;

  const { data: bindingData, error: bindingError } = await supabase
    .from("ai_feature_bindings")
    .select("feature_key, model_id, system_prompt, is_enabled, lifecycle_state");
  if (bindingError) throw new Error("读取 AI 业务配置失败");

  const configs = (bindingData as AiFeatureBindingRow[] | null ?? []).map(mapFeatureBinding);
  featureCache.set("bindings", configs);
  return configs.find(config => config.featureKey === featureKey) ?? null;
}

/** 正式候选与指定渠道共用同一份调用参数映射。 */
function toChannelConfig(config: ProviderKeyModelConfig): ChannelConfig {
  return {
    id: config.providerKeyModelId,
    name: config.providerName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.modelId,
    providerKeyModelId: config.providerKeyModelId,
    providerKeyId: config.providerKeyId,
    requiresProbe: config.requiresProbe,
    cooldownUntil: config.cooldownUntil,
    source: "provider_key_model",
  };
}

/**
 * 主模型最多试几条就交给全局默认。两条 × 单次上限之和低于整链预算，
 * 保证兜底模型仍有时间被尝试；主模型与默认是同一个模型时只有一条链，不截断。
 */
export const PRIMARY_MODEL_CHANNEL_LIMIT = 2;

/** 能用供应按所选→默认；冷却中的供应统一排最后，截止早的先试。 */
async function resolveFeatureChannelChain(featureConfig: FeatureConfig): Promise<ChannelConfig[]> {
  const supabase = getServiceSupabaseClient();
  if (!supabase) return [];
  const fallback = await getFeatureConfig("default");
  const { modelIds: ids } = resolveFeatureModelRouting({
    modelId: featureConfig.modelId, defaultModelId: fallback?.modelId,
    isAvailable: () => true, // 仅列出允许参与的两个模型；供应状态由同源治理规则筛选。
  });
  const lists = await Promise.all(ids.map(id => listRankedProviderKeyModels(supabase, id, { includeSleeping: true })));
  const all = lists.flat().map(({ config }) => toChannelConfig(config));
  const primaryModelId = ids[0];
  const available = ids.length > 1
    ? [
        ...all.filter(channel => !channel.cooldownUntil && channel.model === primaryModelId)
          .slice(0, PRIMARY_MODEL_CHANNEL_LIMIT),
        ...all.filter(channel => !channel.cooldownUntil && channel.model !== primaryModelId),
      ]
    : all.filter(channel => !channel.cooldownUntil);
  return [
    ...available,
    ...all.filter(channel => channel.cooldownUntil).sort((a, b) => Date.parse(a.cooldownUntil!) - Date.parse(b.cooldownUntil!)),
  ];
}

async function getProviderKeyModelChannel(providerKeyModelId: string): Promise<ChannelConfig | null> {
  const supabase = getServiceSupabaseClient();
  if (!supabase) return null;

  const config = await getProviderKeyModelConfig(supabase, providerKeyModelId);
  if (!config) return null;

  return toChannelConfig(config);
}


export function resetFeatureCache() { featureCache.clear(); }
export function setServiceClientForTests(client: unknown) { _serviceClient = client; resetFeatureCache(); }
export { getEnvFlag, isDbChannelModeEnabled, getChannelFromEnv, getServiceSupabaseClient, getFeatureConfig, resolveFeatureChannelChain, getProviderKeyModelChannel };
