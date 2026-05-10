import {
  AiChannelRow,
  ChannelStatus,
  AiFeatureApiRow,
  AiFeatureItem,
  AiFeatureCardItem,
  FeatureSaveState,
} from "./types";
import { AI_FEATURE_GROUP_ORDER, getAiFeatureMetadata, type AiFeatureGroup } from "@/lib/ai/feature-metadata";

export const FEATURE_SAVE_FEEDBACK_MS = 1600;

export function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 4)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMaskedFromApi(value: string) {
  if (!value) return "—";
  if (value.includes("***")) return value;
  return maskApiKey(value);
}

export function sortChannels(channels: AiChannelRow[]) {
  return [...channels].sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name, "zh-CN"));
}

export function getStatus(channel: AiChannelRow): ChannelStatus {
  if (!channel.is_enabled) return "disabled";
  if (channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now()) return "circuit";
  return "healthy";
}

export function getStatusMeta(channel: AiChannelRow) {
  const status = getStatus(channel);
  if (status === "disabled") {
    return {
      label: "已禁用",
      variant: "outline" as const,
      className: "border-zinc-200 bg-zinc-50 text-zinc-500",
    };
  }

  if (status === "circuit") {
    return {
      label: `熔断中 · ${formatDateTime(channel.unhealthy_until)}`,
      variant: "destructive" as const,
      className: "rounded-full",
    };
  }

  return {
    label: "健康",
    variant: "default" as const,
    className: "rounded-full bg-[#6FAA7D] text-white hover:bg-[#6FAA7D]",
  };
}

export function isRecoverable(channel: AiChannelRow) {
  return Boolean(channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now());
}

export type FeatureSavePayload = {
  id: string;
  channel_id: string | null;
  model: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
};

export function normalizeFeatureItem(feature: AiFeatureApiRow | AiFeatureItem): AiFeatureItem {
  return {
    ...feature,
    channel_id: feature.channel_id ?? "",
    channel_name: feature.channel_name ?? null,
    model: typeof feature.model === "string" ? feature.model : "",
    system_prompt: feature.system_prompt ?? "",
  };
}

export function buildFeatureSavePayload(feature: AiFeatureItem): FeatureSavePayload {
  const channelId = feature.channel_id.trim();
  const model = feature.model.trim();
  const systemPrompt = feature.system_prompt.trim();

  return {
    id: feature.id,
    channel_id: channelId || null,
    model: model || null,
    system_prompt: systemPrompt || null,
    is_enabled: feature.is_enabled,
  };
}

export function getFeaturePayloadKey(featureOrPayload: AiFeatureItem | FeatureSavePayload) {
  const payload = "feature_key" in featureOrPayload ? buildFeatureSavePayload(featureOrPayload) : featureOrPayload;
  return JSON.stringify(payload);
}

export function applyFeaturePatch(feature: AiFeatureItem, patch: Record<string, unknown>): AiFeatureItem {
  const next = {
    ...feature,
    ...patch,
    channel_id: typeof patch.channel_id === "string" ? patch.channel_id : feature.channel_id,
    channel_name:
      patch.channel_name === null || typeof patch.channel_name === "string" ? patch.channel_name : feature.channel_name,
    model: typeof patch.model === "string" ? patch.model : feature.model,
    system_prompt: typeof patch.system_prompt === "string" ? patch.system_prompt : feature.system_prompt,
  } satisfies AiFeatureItem;

  return next;
}

export function isFeatureVersionCurrent(currentVersion: number | undefined, expectedVersion: number) {
  return (currentVersion ?? 0) === expectedVersion;
}

export function resolveSelectedChannelId(input: {
  channels: AiChannelRow[];
  currentSelectedChannelId: string | null;
  isCreatingChannel: boolean;
}) {
  if (input.isCreatingChannel) return null;
  if (input.channels.length === 0) return null;

  if (input.currentSelectedChannelId && input.channels.some((channel) => channel.id === input.currentSelectedChannelId)) {
    return input.currentSelectedChannelId;
  }

  return input.channels[0].id;
}

export function mergeLoadedFeatures(input: {
  loadedFeatures: AiFeatureItem[];
  localFeatures: AiFeatureItem[];
  saveStates: Record<string, FeatureSaveState>;
  lastSaved: Record<string, string>;
  validChannelIds?: Set<string>;
}) {
  const localById = new Map(input.localFeatures.map((feature) => [feature.id, feature]));
  const nextLastSaved: Record<string, string> = {};

  const features = input.loadedFeatures.map((serverFeature) => {
    const normalizedServer = normalizeFeatureItem(serverFeature);
    const localFeature = localById.get(normalizedServer.id);
    const localFeatureToKeep =
      localFeature &&
      (!localFeature.channel_id || !input.validChannelIds || input.validChannelIds.has(localFeature.channel_id))
        ? localFeature
        : null;
    const saveState = input.saveStates[normalizedServer.id] ?? "idle";

    if (localFeatureToKeep) {
      const localPayloadKey = getFeaturePayloadKey(localFeatureToKeep);
      const hasUnsavedLocalChanges = localPayloadKey !== input.lastSaved[normalizedServer.id];

      if (hasUnsavedLocalChanges && (saveState === "pending" || saveState === "saving" || saveState === "error")) {
        nextLastSaved[normalizedServer.id] = input.lastSaved[normalizedServer.id] ?? getFeaturePayloadKey(normalizedServer);
        return localFeatureToKeep;
      }
    }

    nextLastSaved[normalizedServer.id] = getFeaturePayloadKey(normalizedServer);
    return normalizedServer;
  });

  return {
    features,
    lastSaved: nextLastSaved,
  };
}

export type AiFeatureGroupSection = {
  group: AiFeatureGroup;
  description: string;
  features: AiFeatureCardItem[];
};

const GROUP_DESCRIPTIONS: Record<AiFeatureGroup, string> = {
  成长分析: "把 growth 页里的区块说明、AI 输出职责和专属提示词收成一套。",
  内容工具: "服务内容策划和批量生产，不跟 growth 诊断混在一起。",
  "OCR/截图识别": "负责把截图先识别成结构化数据，给后面的分析接口当输入。",
  "后台 AI 助手": "服务管理员操作和诊断，不直接给前台用户看。",
  "其他已有 AI 能力": "保留现有 AI 能力，先按用途归档，后续再细分。",
};

export function buildFeatureGroups(features: AiFeatureItem[]): AiFeatureGroupSection[] {
  const bucket = new Map<AiFeatureGroup, AiFeatureCardItem[]>();
  for (const feature of features) {
    const metadata = getAiFeatureMetadata(feature.feature_key, feature.label);
    const list = bucket.get(metadata.group) ?? [];
    list.push({ ...feature, metadata });
    bucket.set(metadata.group, list);
  }
  return AI_FEATURE_GROUP_ORDER
    .map((group) => ({
      group,
      description: GROUP_DESCRIPTIONS[group],
      features: (bucket.get(group) ?? []).sort((left, right) => left.metadata.title.localeCompare(right.metadata.title, "zh-CN")),
    }))
    .filter((section) => section.features.length > 0);
}
