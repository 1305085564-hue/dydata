import { getModelDisplayName } from "@/lib/ai/model-families";
import {
  getProviderKeyHealthStatus,
  isProviderKeyHealthy,
  type ProviderKeyHealthStatus,
} from "@/lib/ai/provider-routing";

/**
 * AI 配置中心的统一可用性计算。
 *
 * 展示口径（健康）：复用 provider-routing.getProviderKeyHealthStatus，
 *   healthy=健康检测通过 / untested=已启用未检测 / fault=存在失败或健康冻结 / disabled=停用。
 * 调度口径（可调度）：复用运行时 isProviderKeyHealthy（key×模型×服务商三层启用且未被健康冻结），
 *   与 client.ts 的 resolveFeatureChannelChain / provider-routing.toConfig 完全同义。
 * 回退口径（受影响业务）：业务指定模型 → 该模型有可调度渠道；未指定 → 全局默认；
 *   指定/默认模型无渠道或未配置 → 运行时走全量顺位，记为"正在使用回退"。
 * 本模块只做展示统计，不参与运行时调度。
 */

export type KeyHealthState = "healthy" | "untested" | "fault" | "disabled";

export type AvailabilityProvider = {
  id: string;
  name: string;
  is_enabled: boolean;
};

export type AvailabilityKey = {
  id: string;
  provider_id: string;
  label?: string | null;
  is_enabled: boolean;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
};

export type AvailabilityModel = {
  id: string;
  key_id: string;
  model_id: string;
  display_name?: string | null;
  is_enabled: boolean;
};

export type AvailabilityFeatureControl = {
  key: string;
  label: string;
  group: string;
  isEnabled: boolean;
  lifecycleState: string;
  modelId: string | null;
  providerKeyModelId: string | null;
};

export type AvailabilityDefaultBinding = {
  feature_key: string;
  model_id?: string | null;
};

export type AvailabilityInput = {
  providers?: AvailabilityProvider[];
  keys?: AvailabilityKey[];
  models?: AvailabilityModel[];
  featureControls?: AvailabilityFeatureControl[];
  defaultBinding?: AvailabilityDefaultBinding | null;
};

export type AvailabilityChannel = {
  keyModelId: string;
  keyId: string;
  modelId: string;
  providerId: string;
  providerName: string;
  health: KeyHealthState;
  isSchedulable: boolean;
};

export type AvailabilityModelFamily = {
  modelId: string;
  displayName: string;
  isShelved: boolean;
  channels: AvailabilityChannel[];
  schedulableChannelCount: number;
  faultChannelCount: number;
};

export type AvailabilityKeySummary = {
  keyId: string;
  label: string;
  providerId: string;
  providerName: string;
  health: KeyHealthState;
  isSchedulable: boolean;
  enabledModelCount: number;
};

export type AffectedBusinessFeature = {
  key: string;
  label: string;
  resolvedModelId: string | null;
};

export type AvailabilityReport = {
  keys: AvailabilityKeySummary[];
  totalKeyCount: number;
  enabledKeyCount: number;
  healthyKeyCount: number;
  untestedKeyCount: number;
  faultKeyCount: number;
  schedulableKeyCount: number;
  modelFamilies: AvailabilityModelFamily[];
  activeModelFamilyCount: number;
  schedulableModelFamilyCount: number;
  noChannelModelFamilyCount: number;
  globalDefaultModelId: string | null;
  affectedBusinessFeatures: AffectedBusinessFeature[];
  affectedBusinessCount: number;
};

function mapHealth(status: ProviderKeyHealthStatus): KeyHealthState {
  return status === "unhealthy" ? "fault" : status;
}

function isLayerEnabled(input: {
  modelEnabled: boolean;
  key?: AvailabilityKey;
  provider?: AvailabilityProvider;
}) {
  return Boolean(input.modelEnabled && input.key?.is_enabled && input.provider?.is_enabled);
}

function keyPassesRuntimeHealth(key: AvailabilityKey, now: number) {
  return isProviderKeyHealthy({
    isEnabled: true,
    consecutiveFailures: key.consecutive_failures,
    unhealthyUntil: key.unhealthy_until,
    now,
  });
}

export function computeAvailability(
  input: AvailabilityInput,
  options: { now?: number } = {},
): AvailabilityReport {
  const now = options.now ?? Date.now();
  const providers = input.providers ?? [];
  const keys = input.keys ?? [];
  const models = input.models ?? [];
  const featureControls = input.featureControls ?? [];

  const providerById = new Map(providers.map((p) => [p.id, p]));
  const keyById = new Map(keys.map((k) => [k.id, k]));

  // 渠道（key × model）级可用性，调度判定与运行时 toConfig/listRankedProviderKeyModels 同义
  const channels: AvailabilityChannel[] = [];
  const shelvedModelIds = new Set<string>();
  const displayNameByModelId = new Map<string, string>();

  for (const m of models) {
    const key = keyById.get(m.key_id);
    const provider = key ? providerById.get(key.provider_id) : undefined;
    const layerEnabled = isLayerEnabled({ modelEnabled: m.is_enabled, key, provider });

    if (m.is_enabled) shelvedModelIds.add(m.model_id);
    if (!displayNameByModelId.has(m.model_id)) {
      displayNameByModelId.set(m.model_id, m.display_name || getModelDisplayName(m.model_id));
    }

    const health: KeyHealthState = layerEnabled && key
      ? mapHealth(getProviderKeyHealthStatus({
          isEnabled: true,
          lastSuccessAt: key.last_success_at,
          lastFailureAt: key.last_failure_at,
          unhealthyUntil: key.unhealthy_until,
          now,
        }))
      : "disabled";

    channels.push({
      keyModelId: m.id,
      keyId: m.key_id,
      modelId: m.model_id,
      providerId: provider?.id ?? "",
      providerName: provider?.name ?? "",
      health,
      isSchedulable: layerEnabled && Boolean(key) && keyPassesRuntimeHealth(key!, now),
    });
  }

  // 密钥级汇总：健康看展示口径，可调度看运行时口径
  const keySummaries: AvailabilityKeySummary[] = keys.map((k) => {
    const provider = providerById.get(k.provider_id);
    const keyEnabled = Boolean(k.is_enabled && provider?.is_enabled);
    const health: KeyHealthState = keyEnabled
      ? mapHealth(getProviderKeyHealthStatus({
          isEnabled: true,
          lastSuccessAt: k.last_success_at,
          lastFailureAt: k.last_failure_at,
          unhealthyUntil: k.unhealthy_until,
          now,
        }))
      : "disabled";
    const enabledModelCount = models.filter((m) => m.key_id === k.id && m.is_enabled).length;
    return {
      keyId: k.id,
      label: k.label ?? "",
      providerId: k.provider_id,
      providerName: provider?.name ?? "",
      health,
      isSchedulable: keyEnabled && enabledModelCount > 0 && keyPassesRuntimeHealth(k, now),
      enabledModelCount,
    };
  });

  // 按模型系列归集渠道
  const familyByModelId = new Map<string, AvailabilityModelFamily>();
  for (const ch of channels) {
    let family = familyByModelId.get(ch.modelId);
    if (!family) {
      family = {
        modelId: ch.modelId,
        displayName: displayNameByModelId.get(ch.modelId) ?? getModelDisplayName(ch.modelId),
        isShelved: shelvedModelIds.has(ch.modelId),
        channels: [],
        schedulableChannelCount: 0,
        faultChannelCount: 0,
      };
      familyByModelId.set(ch.modelId, family);
    }
    family.channels.push(ch);
  }
  const modelFamilies = Array.from(familyByModelId.values());
  for (const family of modelFamilies) {
    family.schedulableChannelCount = family.channels.filter((c) => c.isSchedulable).length;
    family.faultChannelCount = family.channels.filter((c) => c.health === "fault").length;
  }

  const activeFamilies = modelFamilies.filter((f) => f.isShelved);

  // 全局默认模型：default 绑定不在 featureControls（仅 business 组），从 featureBindings 取
  const globalDefaultModelId =
    input.defaultBinding?.model_id?.trim() ||
    featureControls.find((c) => c.key === "default")?.modelId?.trim() ||
    null;

  // 受影响业务：解析到的目标模型无可调度渠道，或完全未配置模型（运行时直接走全量顺位）
  const modelById = new Map(models.map((m) => [m.id, m]));
  const affectedBusinessFeatures: AffectedBusinessFeature[] = [];
  for (const control of featureControls) {
    if (control.group !== "business" || control.lifecycleState !== "active" || !control.isEnabled) {
      continue;
    }
    const resolvedModelId = resolveFeatureModelId(
      control,
      modelById,
      keyById,
      providerById,
      globalDefaultModelId,
    );
    const schedulableCount = resolvedModelId
      ? familyByModelId.get(resolvedModelId)?.schedulableChannelCount ?? 0
      : 0;
    if (!resolvedModelId || schedulableCount === 0) {
      affectedBusinessFeatures.push({ key: control.key, label: control.label, resolvedModelId });
    }
  }

  return {
    keys: keySummaries,
    totalKeyCount: keys.length,
    enabledKeyCount: keySummaries.filter((s) => s.health !== "disabled").length,
    healthyKeyCount: keySummaries.filter((s) => s.health === "healthy").length,
    untestedKeyCount: keySummaries.filter((s) => s.health === "untested").length,
    faultKeyCount: keySummaries.filter((s) => s.health === "fault").length,
    schedulableKeyCount: keySummaries.filter((s) => s.isSchedulable).length,
    modelFamilies,
    activeModelFamilyCount: activeFamilies.length,
    schedulableModelFamilyCount: activeFamilies.filter((f) => f.schedulableChannelCount > 0).length,
    noChannelModelFamilyCount: activeFamilies.filter((f) => f.schedulableChannelCount === 0).length,
    globalDefaultModelId,
    affectedBusinessFeatures,
    affectedBusinessCount: affectedBusinessFeatures.length,
  };
}

/** 口径对齐 resolveFeatureChannelChain：显式模型 → 整链启用的 pinned 渠道推导 → 全局默认 */
function resolveFeatureModelId(
  control: AvailabilityFeatureControl,
  modelById: Map<string, AvailabilityModel>,
  keyById: Map<string, AvailabilityKey>,
  providerById: Map<string, AvailabilityProvider>,
  defaultModelId: string | null,
): string | null {
  const explicit = control.modelId?.trim();
  if (explicit) return explicit;

  if (control.providerKeyModelId) {
    const pinned = modelById.get(control.providerKeyModelId);
    const key = pinned ? keyById.get(pinned.key_id) : undefined;
    const provider = key ? providerById.get(key.provider_id) : undefined;
    if (pinned && isLayerEnabled({ modelEnabled: pinned.is_enabled, key, provider })) {
      return pinned.model_id;
    }
  }
  return defaultModelId;
}
