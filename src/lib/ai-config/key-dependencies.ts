import { buildAiFeatureControls, type AiFeatureBindingControlRow } from "@/lib/ai-config/feature-controls";
import { computeAvailability, type AvailabilityInput } from "@/lib/ai-config/availability";

export type DependencyScope = "provider" | "key" | "supply" | "model";

export type AffectedBusiness = {
  key: string;
  label: string;
  selectedModelId: string | null;
  preferredModelId: string | null;
  defaultModelId: string | null;
};

export type DependencyPreview = {
  scope: DependencyScope;
  targetId: string;
  complete: boolean;
  unknownReasons: string[];
  requiresConfirmation: boolean;
  affectedBusinesses: AffectedBusiness[];
  channels: Array<{
    id: string;
    name: string;
    providerName: string;
    models: Array<{ modelId: string; displayName: string | null; isEnabled: boolean; isGloballyEnabled: boolean }>;
    businessFunctions: Array<{ key: string; label: string }>;
  }>;
  businessFunctions: Array<{ key: string; label: string }>;
  criticalBindings: Array<{ id: string; key: string; label: string; modelId: string | null }>;
  affectedBindings: Array<{ id: string; key: string; label: string; modelId: string | null }>;
  remainingAvailableLineCount?: number;
  soleBusinessFunctions?: Array<{ key: string; label: string }>;
};

type DependencyInput = {
  scope: DependencyScope;
  id: string;
  /** Used by set_key_model_selection to simulate only the rows being unchecked. */
  disableSupplyIds?: string[];
};

type DependencyBindingRow = AiFeatureBindingControlRow & {
  label: string;
};

type DependencySnapshot = {
  providers: NonNullable<AvailabilityInput["providers"]>;
  keys: NonNullable<AvailabilityInput["keys"]>;
  models: NonNullable<AvailabilityInput["models"]>;
  bindings: DependencyBindingRow[];
};

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDependencySnapshot(supabase: any): Promise<DependencySnapshot> {
  const [providersResult, keysResult, modelsResult, bindingsResult] = await Promise.all([
    supabase.from("ai_providers").select("id, name, is_enabled"),
    supabase.from("ai_provider_keys").select("id, provider_id, label, is_enabled, consecutive_failures, unhealthy_until, last_failure_at, last_success_at, first_failure_at, invalidated_at, manual_sleep_until"),
    // `*` keeps the new marker readable with an app-before-migration rollout; old columns are discarded below.
    supabase.from("ai_provider_key_models").select("*"),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, model_id, system_prompt, output_token_limit, context_message_limit, channel_settings, is_enabled, lifecycle_state, archived_at, archived_reason"),
  ]);
  const firstError = providersResult.error ?? keysResult.error ?? modelsResult.error ?? bindingsResult.error;
  if (firstError) throw new Error(firstError.message);

  const models = ((modelsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const model = { ...row };
    delete model.global_is_enabled;
    return model;
  }) as unknown as NonNullable<AvailabilityInput["models"]>;

  return {
    providers: (providersResult.data ?? []) as NonNullable<AvailabilityInput["providers"]>,
    keys: (keysResult.data ?? []) as NonNullable<AvailabilityInput["keys"]>,
    models,
    bindings: (bindingsResult.data ?? []) as DependencyBindingRow[],
  };
}

function computeReport(snapshot: DependencySnapshot) {
  const defaultBinding = snapshot.bindings.find((binding) => binding.feature_key === "default") ?? null;
  return computeAvailability({
    providers: snapshot.providers,
    keys: snapshot.keys,
    models: snapshot.models,
    featureControls: buildAiFeatureControls(snapshot.bindings),
    defaultBinding,
  });
}

function requireTarget(snapshot: DependencySnapshot, input: DependencyInput) {
  if (input.scope === "provider" && !snapshot.providers.some((provider) => provider.id === input.id)) throw new Error("接入点不存在");
  if (input.scope === "key" && !snapshot.keys.some((key) => key.id === input.id)) throw new Error("渠道不存在");
  if (input.scope === "supply" && !snapshot.models.some((model) => model.id === input.id)) throw new Error("渠道未挂载此模型");
  if (input.scope === "model" && !snapshot.models.some((model) => model.model_id === input.id)) throw new Error("模型不存在");
}

function simulateDisable(snapshot: DependencySnapshot, input: DependencyInput): DependencySnapshot {
  const disabledSupplyIds = new Set(input.disableSupplyIds ?? []);

  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => provider.id === input.id && input.scope === "provider"
      ? { ...provider, is_enabled: false }
      : provider),
    keys: snapshot.keys.map((key) => key.id === input.id && input.scope === "key" && input.disableSupplyIds === undefined
      ? { ...key, is_enabled: false }
      : key),
    models: snapshot.models.map((model) => {
      const disabled = input.scope === "model"
        ? model.model_id === input.id
        : input.scope === "supply"
          ? model.id === input.id
          : input.scope === "key"
            ? input.disableSupplyIds !== undefined && disabledSupplyIds.has(model.id)
            : false;
      return disabled ? { ...model, is_enabled: false } : model;
    }),
  };
}

function toAffectedBusiness(item: ReturnType<typeof computeAvailability>["businessAssurances"][number]): AffectedBusiness {
  return {
    key: item.key,
    label: item.label,
    selectedModelId: item.selectedModelId,
    preferredModelId: item.preferredModelId,
    defaultModelId: item.defaultModelId,
  };
}

/** Uses one database snapshot and the same availability rules as the admin response. */
export async function buildDependencyPreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: DependencyInput,
): Promise<DependencyPreview> {
  const snapshot = await loadDependencySnapshot(supabase);
  requireTarget(snapshot, input);
  const before = computeReport(snapshot);
  const after = computeReport(simulateDisable(snapshot, input));
  const beforeByKey = new Map(before.businessAssurances.map((item) => [item.key, item]));
  const affectedBusinesses = after.businessAssurances
    .filter((item) => item.routingStatus === "outage" && beforeByKey.get(item.key)?.routingStatus !== "outage")
    .map(toAffectedBusiness);
  const businessFunctions = affectedBusinesses.map(({ key, label }) => ({ key, label }));
  const affectedBindings = affectedBusinesses.map((item) => ({
    id: item.key,
    key: item.key,
    label: item.label,
    modelId: item.selectedModelId,
  }));

  const targetModelId = input.scope === "model"
    ? input.id
    : input.scope === "supply"
      ? snapshot.models.find((model) => model.id === input.id)?.model_id ?? null
      : null;
  const selectedKeys = input.scope === "provider"
    ? snapshot.keys.filter((key) => key.provider_id === input.id)
    : input.scope === "key"
      ? snapshot.keys.filter((key) => key.id === input.id)
      : input.scope === "supply"
        ? snapshot.keys.filter((key) => key.id === snapshot.models.find((model) => model.id === input.id)?.key_id)
        : input.scope === "model"
          ? snapshot.keys.filter((key) => snapshot.models.some((model) => model.key_id === key.id && model.model_id === input.id))
        : [];
  const afterModelFamilies = new Map(after.modelFamilies.map((family) => [family.modelId, family]));
  const channels = selectedKeys.map((key) => {
    const provider = snapshot.providers.find((item) => item.id === key.provider_id);
    const models = snapshot.models.filter((model) => model.key_id === key.id && (
      input.scope === "supply" ? model.id === input.id : input.scope === "model" ? model.model_id === input.id : true
    ));
    const affectedKeys = new Set(affectedBusinesses.map((item) => item.key));
    const modelIds = new Set(models.map((model) => model.model_id));
    const directlyAffected = after.businessAssurances
      .filter((item) => affectedKeys.has(item.key) && item.selectedModelId && modelIds.has(item.selectedModelId))
      .map((item) => ({ key: item.key, label: item.label }));
    return {
      id: key.id,
      name: key.label ?? "",
      providerName: provider?.name ?? "未知接入点",
      models: models.map((model) => ({
        modelId: model.model_id,
        displayName: model.display_name ?? null,
        isEnabled: model.is_enabled,
        isGloballyEnabled: model.is_enabled,
      })),
      businessFunctions: directlyAffected,
    };
  });
  const remainingAvailableLineCount = targetModelId
    ? afterModelFamilies.get(targetModelId)?.schedulableChannelCount ?? 0
    : undefined;

  return {
    scope: input.scope,
    targetId: input.id,
    complete: true,
    unknownReasons: [],
    requiresConfirmation: affectedBusinesses.length > 0,
    affectedBusinesses,
    channels,
    businessFunctions,
    criticalBindings: [],
    affectedBindings,
    ...(remainingAvailableLineCount !== undefined ? {
      remainingAvailableLineCount,
      soleBusinessFunctions: remainingAvailableLineCount === 0 ? businessFunctions : [],
    } : {}),
  };
}

export function requireDependencyConfirmation(
  preview: DependencyPreview,
  confirmed: boolean,
  actionLabel: string,
) {
  if (!preview.complete) {
    const error = new Error(`${actionLabel}无法确认业务影响范围：${preview.unknownReasons.join("；")}`) as Error & {
      status?: number;
      requiresConfirmation?: boolean;
      affectedBusinesses?: AffectedBusiness[];
      unknownReasons?: string[];
    };
    error.status = 409;
    error.requiresConfirmation = false;
    error.affectedBusinesses = preview.affectedBusinesses;
    error.unknownReasons = preview.unknownReasons;
    throw error;
  }
  if (!preview.requiresConfirmation || confirmed) return;
  const names = preview.affectedBusinesses.map((item) => item.label).join("、");
  const error = new Error(`${actionLabel}会让【${names}】无可用模型，请确认后重试`) as Error & {
    status?: number;
    requiresConfirmation?: boolean;
    affectedBusinesses?: AffectedBusiness[];
  };
  error.status = 409;
  error.requiresConfirmation = true;
  error.affectedBusinesses = preview.affectedBusinesses;
  throw error;
}
