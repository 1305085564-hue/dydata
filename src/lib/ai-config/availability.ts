import { resolveFeatureModelRouting } from "@/lib/ai/feature-routing";
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
  providerKeyModelId?: string | null;
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
  isConfigured: boolean;
  isSelectable: boolean;
  unavailableReasonKey: "model.no_available_supply" | null;
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
  routingStatus: "normal" | "fallback" | "outage";
  selectedModelId: string | null;
  preferredModelId: string | null;
  defaultModelId: string | null;
  messageKey: "business.normal" | "business.fallback" | "business.outage";
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
  businessSummary: { normal: number; fallback: number; outage: number; needsAttentionChannels: number };
};

function legacyHealth(identity: ChannelIdentity, hasSuccess: boolean): KeyHealthState {
  return identity === "active" ? (hasSuccess ? "healthy" : "untested") : identity === "disabled" ? "disabled" : "fault";
}

function countIdentities(rows: Array<{ identity: ChannelIdentity }>): Record<ChannelIdentity, number> {
  const counts = { active: 0, retest: 0, sleeping: 0, invalid: 0, disabled: 0 };
  for (const row of rows) counts[row.identity]++;
  return counts;
}

/** Compatibility name for the old UI; only supply switches determine configuration. */
export function resolveModelGlobalEnabled(modelId: string, models: AvailabilityModel[]): boolean {
  return models.some(model => model.model_id === modelId && model.is_enabled);
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
      sortOrder: m.sort_order ?? 0,
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
        isConfigured: false,
        isSelectable: false,
        unavailableReasonKey: "model.no_available_supply",
      };
      familyByModelId.set(ch.modelId, family);
    }
    family.channels.push(ch);
  }
  const modelFamilies = Array.from(familyByModelId.values());
  for (const family of modelFamilies) {
    family.channels.sort((a, b) => a.sortOrder - b.sortOrder || a.keyModelId.localeCompare(b.keyModelId));
    family.identityCounts = countIdentities(family.channels);
    family.redundancyCount = Math.max(0, family.channels.filter((c) => c.isSchedulable).length - 1);
    family.singlePointRisk = family.channels.filter((c) => c.isSchedulable).length <= 1;
    family.healthyChannelCount = family.channels.filter((c) => c.health === "healthy").length;
    family.untestedChannelCount = family.channels.filter((c) => c.health === "untested").length;
    family.schedulableChannelCount = family.channels.filter((c) => c.isSchedulable).length;
    family.faultChannelCount = family.channels.filter((c) => c.health === "fault").length;
    family.isConfigured = models.some(model => model.model_id === family.modelId && model.is_enabled);
    family.isSelectable = family.schedulableChannelCount > 0;
    family.unavailableReasonKey = family.isSelectable ? null : "model.no_available_supply";
  }


  // 全局默认模型：default 绑定不在 featureControls（仅 business 组），从 featureBindings 取
  const globalDefaultModelId =
    input.defaultBinding?.model_id?.trim() ||
    featureControls.find((c) => c.key === "default")?.modelId?.trim() ||
    null;

  // 业务保障：计算全量活跃业务功能的模型解析与渠道保障状态
  const affectedBusinessFeatures: AffectedBusinessFeature[] = [];
  const businessAssurances: BusinessAssuranceItem[] = [];
  for (const control of featureControls) {
    if (control.group !== "business" || control.lifecycleState !== "active" || !control.isEnabled) continue;
    const routing = resolveFeatureModelRouting({
      modelId: control.modelId, defaultModelId: globalDefaultModelId,
      isAvailable: id => Boolean(familyByModelId.get(id)?.schedulableChannelCount),
    });
    const family = routing.preferredModelId ? familyByModelId.get(routing.preferredModelId) : undefined;
    businessAssurances.push({
      key: control.key, label: control.label,
      resolvedModelId: routing.preferredModelId,
      preferredModelId: routing.preferredModelId,
      selectedModelId: routing.selectedModelId,
      defaultModelId: routing.defaultModelId,
      modelDisplayName: family?.displayName ?? (routing.preferredModelId ? getModelDisplayName(routing.preferredModelId) : "无可用模型"),
      schedulableChannelCount: family?.schedulableChannelCount ?? 0,
      faultChannelCount: family?.faultChannelCount ?? 0,
      totalChannelCount: family?.channels.length ?? 0,
      status: routing.status === "normal" ? "healthy" : routing.status === "fallback" ? "degraded" : "outage",
      routingStatus: routing.status,
      messageKey: `business.${routing.status}`,
    });
    if (routing.status === "outage") affectedBusinessFeatures.push({ key: control.key, label: control.label, resolvedModelId: null });
  }
  // Configured and selected models stay discoverable even during a total outage.
  const referenced = new Set([globalDefaultModelId, ...featureControls.map(control => control.modelId)].filter((id): id is string => Boolean(id)));
  for (const family of modelFamilies) family.isShelved = family.isConfigured || referenced.has(family.modelId);
  for (const id of referenced) {
    if (familyByModelId.has(id)) continue;
    const family: AvailabilityModelFamily = {
      modelId: id, displayName: getModelDisplayName(id), isShelved: true, globalIsEnabled: false,
      channelReadyButGlobalDisabled: 0, channels: [], identityCounts: countIdentities([]),
      redundancyCount: 0, singlePointRisk: true, healthyChannelCount: 0, untestedChannelCount: 0,
      schedulableChannelCount: 0, faultChannelCount: 0, isConfigured: false, isSelectable: false,
      unavailableReasonKey: "model.no_available_supply",
    };
    familyByModelId.set(id, family);
    modelFamilies.push(family);
  }
  const activeFamilies = modelFamilies.filter(family => family.isShelved);

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
    businessSummary: {
      normal: businessAssurances.filter(item => item.routingStatus === "normal").length,
      fallback: businessAssurances.filter(item => item.routingStatus === "fallback").length,
      outage: affectedBusinessFeatures.length,
      needsAttentionChannels: keySummaries.filter(key => key.identity === "invalid").length,
    },
  };
}
