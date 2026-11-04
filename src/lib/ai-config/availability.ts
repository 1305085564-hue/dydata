import { getModelDisplayName, resolveModelDisplayName } from "@/lib/ai/model-families";
import {
  isProviderKeyModelSchedulable,
} from "@/lib/ai/provider-routing";

import { getChannelGovernance, getProviderKeyGovernance, type ChannelGovernance, type ChannelIdentity, type ProviderHealthFields } from "@/lib/ai/channel-governance";

/** 五类身份与正式调度共用 channel-governance；旧 health 字段仅供视觉迁移兼容。 */

export type KeyHealthState = "healthy" | "untested" | "fault" | "disabled";

export type AvailabilityProvider = {
  id: string;
  name: string;
  is_enabled: boolean;
};

export type AvailabilityKey = ProviderHealthFields & {
  priority?: number;
  manual_sleep_until?: string | null;
  id: string;
  provider_id: string;
  label?: string | null;
  is_enabled: boolean;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
};

export type AvailabilityModel = ProviderHealthFields & {
  sort_order?: number;
  id: string;
  key_id: string;
  model_id: string;
  display_name?: string | null;
  is_enabled: boolean;
  global_is_enabled?: boolean | null;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
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

export type AvailabilityChannel = ChannelGovernance & {
  sortOrder: number;
  keyModelId: string;
  keyId: string;
  modelId: string;
  providerId: string;
  providerName: string;
  label: string;
  health: KeyHealthState;
  isSchedulable: boolean;
};

export type AvailabilityModelFamily = {
  modelId: string;
  displayName: string;
  isShelved: boolean;
  globalIsEnabled: boolean | null;
  channelReadyButGlobalDisabled: number;
  channels: AvailabilityChannel[];
  identityCounts: Record<ChannelIdentity, number>;
  redundancyCount: number;
  singlePointRisk: boolean;
  healthyChannelCount: number;
  untestedChannelCount: number;
  schedulableChannelCount: number;
  faultChannelCount: number;
};

export type AvailabilityKeySummary = ChannelGovernance & {
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

export type BusinessAssuranceItem = {
  key: string;
  label: string;
  resolvedModelId: string | null;
  modelDisplayName: string;
  schedulableChannelCount: number;
  faultChannelCount: number;
  totalChannelCount: number;
  status: "healthy" | "degraded" | "outage";
};

export type AvailabilityReport = {
  keys: AvailabilityKeySummary[];
  totalKeyCount: number;
  identityCounts: Record<ChannelIdentity, number>;
  redundancyCount: number;
  singlePointRisk: boolean;
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
  businessAssurances: BusinessAssuranceItem[];
};

function legacyHealth(identity: ChannelIdentity, hasSuccess: boolean): KeyHealthState {
  return identity === "active" ? (hasSuccess ? "healthy" : "untested") : identity === "disabled" ? "disabled" : "fault";
}

function countIdentities(rows: Array<{ identity: ChannelIdentity }>): Record<ChannelIdentity, number> {
  const counts = { active: 0, retest: 0, sleeping: 0, invalid: 0, disabled: 0 };
  for (const row of rows) counts[row.identity]++;
  return counts;
}

/** 全局模型状态：未决策（null）时，沿用已有渠道启用状态。 */
export function resolveModelGlobalEnabled(
  modelId: string,
  models: AvailabilityModel[],
): boolean {
  const sameModel = models.filter((model) => model.model_id === modelId);
  const hasEnabledChannel = sameModel.some((model) => model.is_enabled);
  const explicitStates = sameModel
    .map((model) => model.global_is_enabled)
    .filter((state): state is boolean | null => state !== undefined);

  if (explicitStates.some((state) => state === true)) return true;
  if (explicitStates.some((state) => state === null)) return hasEnabledChannel;
  if (explicitStates.length === 0) return hasEnabledChannel;
  return false;
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

  const providerById = new Map(providers.map((p) => [p.id, p])); // gate:transient-map 函数内查找索引，随调用返回释放
  const keyById = new Map(keys.map((k) => [k.id, k])); // gate:transient-map 函数内查找索引，随调用返回释放

  // 渠道（key × model）级可用性，调度判定与运行时 toConfig/listRankedProviderKeyModels 同义
  const channels: AvailabilityChannel[] = [];
  const shelvedModelIds = new Set<string>(); // gate:transient-map 函数内上架集合，随调用返回释放
  const displayNameByModelId = new Map<string, string>(); // gate:transient-map 函数内显示名索引，随调用返回释放
  const globalStateByModelId = new Map<string, boolean | null>();
  for (const model of models) {
    globalStateByModelId.set(model.model_id, resolveModelGlobalEnabled(model.model_id, models));
  }

  for (const m of models) {
    const key = keyById.get(m.key_id);
    const provider = key ? providerById.get(key.provider_id) : undefined;
    const globalEnabled = globalStateByModelId.get(m.model_id) === true;

    if (globalEnabled) shelvedModelIds.add(m.model_id);
    if (!displayNameByModelId.has(m.model_id)) {
      const resolved = resolveModelDisplayName(m.display_name, m.model_id);
      displayNameByModelId.set(m.model_id, resolved);
    }

    const governance = getChannelGovernance({ model: m, key, provider, now });
    const health = legacyHealth(governance.identity, Boolean(key?.last_success_at || m.last_success_at));

    channels.push({
      ...governance,
      sortOrder: m.sort_order ?? key?.priority ?? 100,
      keyModelId: m.id,
      keyId: m.key_id,
      modelId: m.model_id,
      providerId: provider?.id ?? "",
      providerName: provider?.name ?? "",
      label: key?.label ?? "",
      health,
      isSchedulable: isProviderKeyModelSchedulable({ model: m, key, provider, now }),
    });
  }

  // 密钥级汇总：健康看展示口径，可调度看运行时口径
  const keySummaries: AvailabilityKeySummary[] = keys.map((k) => {
    const provider = providerById.get(k.provider_id);
    const keyGovernance = getProviderKeyGovernance({ key: k, provider, now });
    const mounted = channels.filter((channel) => channel.keyId === k.id);
    // A usable model keeps its key available; model-specific failures never disable its siblings.
    const governance = mounted.length ? [...mounted].sort((a, b) =>
      ["active", "retest", "sleeping", "invalid", "disabled"].indexOf(a.identity) -
      ["active", "retest", "sleeping", "invalid", "disabled"].indexOf(b.identity))[0] : { ...keyGovernance, identity: keyGovernance.identity === "disabled" ? "disabled" as const : "invalid" as const, isSchedulable: false };
    const health = legacyHealth(governance.identity, Boolean(k.last_success_at));
    const enabledModelCount = models.filter((m) => m.key_id === k.id && m.is_enabled).length;
    return {
      identity: governance.identity,
      sleepSource: governance.sleepSource,
      sleepUntil: governance.sleepUntil,
      persistentFailure: governance.persistentFailure,
      keyId: k.id,
      label: k.label ?? "",
      providerId: k.provider_id,
      providerName: provider?.name ?? "",
      health,
      isSchedulable: channels.some((channel) => channel.keyId === k.id && channel.isSchedulable),
      enabledModelCount,
    };
  });

  // 按模型系列归集渠道
  const familyByModelId = new Map<string, AvailabilityModelFamily>(); // gate:transient-map 函数内系列归集索引，随调用返回释放
  for (const ch of channels) {
    let family = familyByModelId.get(ch.modelId);
    if (!family) {
      family = {
        modelId: ch.modelId,
        displayName: displayNameByModelId.get(ch.modelId) ?? getModelDisplayName(ch.modelId),
        isShelved: shelvedModelIds.has(ch.modelId),
        globalIsEnabled: globalStateByModelId.get(ch.modelId) ?? null,
        channelReadyButGlobalDisabled: 0,
        channels: [],
        identityCounts: countIdentities([]),
        redundancyCount: 0,
        singlePointRisk: true,
        healthyChannelCount: 0,
        untestedChannelCount: 0,
        schedulableChannelCount: 0,
        faultChannelCount: 0,
      };
      familyByModelId.set(ch.modelId, family);
    }
    family.channels.push(ch);
  }
  const modelFamilies = Array.from(familyByModelId.values());
  for (const family of modelFamilies) {
    family.channels.sort((a, b) => a.sortOrder - b.sortOrder || a.keyId.localeCompare(b.keyId));
    family.identityCounts = countIdentities(family.channels);
    family.redundancyCount = Math.max(0, family.channels.filter((c) => c.isSchedulable).length - 1);
    family.singlePointRisk = family.channels.filter((c) => c.isSchedulable).length <= 1;
    family.healthyChannelCount = family.channels.filter((c) => c.health === "healthy").length;
    family.untestedChannelCount = family.channels.filter((c) => c.health === "untested").length;
    family.schedulableChannelCount = family.channels.filter((c) => c.isSchedulable).length;
    family.faultChannelCount = family.channels.filter((c) => c.health === "fault").length;
    family.channelReadyButGlobalDisabled = models.filter((model) => model.model_id === family.modelId && model.global_is_enabled === false && getChannelGovernance({
      model: { ...model, global_is_enabled: true }, key: keyById.get(model.key_id),
      provider: providerById.get(keyById.get(model.key_id)?.provider_id ?? ""), now,
    }).isSchedulable).length;
  }

  const activeFamilies = modelFamilies.filter((f) => f.isShelved);

  // 全局默认模型：default 绑定不在 featureControls（仅 business 组），从 featureBindings 取
  const globalDefaultModelId =
    input.defaultBinding?.model_id?.trim() ||
    featureControls.find((c) => c.key === "default")?.modelId?.trim() ||
    null;

  // 业务保障：计算全量活跃业务功能的模型解析与渠道保障状态
  const modelById = new Map(models.map((m) => [m.id, m])); // gate:transient-map 函数内查找索引，随调用返回释放
  const affectedBusinessFeatures: AffectedBusinessFeature[] = [];
  const businessAssurances: BusinessAssuranceItem[] = [];
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
      now,
    );
    const family = resolvedModelId ? familyByModelId.get(resolvedModelId) : undefined;
    const schedulableCount = family?.schedulableChannelCount ?? 0;
    const faultCount = family?.faultChannelCount ?? 0;
    const totalCount = family?.channels.length ?? 0;
    const modelDisplayName = family?.displayName ?? (resolvedModelId ? getModelDisplayName(resolvedModelId) : "未配置模型");

    const status: "healthy" | "degraded" | "outage" =
      !resolvedModelId || schedulableCount === 0
        ? "outage"
        : faultCount > 0
        ? "degraded"
        : "healthy";

    businessAssurances.push({
      key: control.key,
      label: control.label,
      resolvedModelId,
      modelDisplayName,
      schedulableChannelCount: schedulableCount,
      faultChannelCount: faultCount,
      totalChannelCount: totalCount,
      status,
    });

    if (!resolvedModelId || schedulableCount === 0) {
      affectedBusinessFeatures.push({ key: control.key, label: control.label, resolvedModelId });
    }
  }

  return {
    keys: keySummaries,
    totalKeyCount: keys.length,
    identityCounts: countIdentities(keySummaries),
    redundancyCount: Math.max(0, keySummaries.filter((s) => s.isSchedulable).length - 1),
    singlePointRisk: keySummaries.filter((s) => s.isSchedulable).length <= 1,
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
    businessAssurances,
  };
}

/** 口径对齐 resolveFeatureChannelChain：显式模型 → 整链启用的 pinned 渠道推导 → 全局默认 */
function resolveFeatureModelId(
  control: AvailabilityFeatureControl,
  modelById: Map<string, AvailabilityModel>,
  keyById: Map<string, AvailabilityKey>,
  providerById: Map<string, AvailabilityProvider>,
  defaultModelId: string | null,
  now: number,
): string | null {
  const explicit = control.modelId?.trim();
  if (explicit) return explicit;

  if (control.providerKeyModelId) {
    const pinned = modelById.get(control.providerKeyModelId);
    const key = pinned ? keyById.get(pinned.key_id) : undefined;
    const provider = key ? providerById.get(key.provider_id) : undefined;
    if (pinned && isProviderKeyModelSchedulable({ model: pinned, key, provider, now })) {
      return pinned.model_id;
    }
  }
  return defaultModelId;
}
