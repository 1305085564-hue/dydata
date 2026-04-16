import { AiChannelRow, ChannelStatus, AiFeatureItem, AiFeatureCardItem } from "./types";
import { AI_FEATURE_GROUP_ORDER, getAiFeatureMetadata, type AiFeatureGroup } from "@/lib/ai/feature-metadata";

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
      className: "border-border/70 bg-muted/70 text-muted-foreground",
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
    className: "rounded-full bg-emerald-600 text-white hover:bg-emerald-600",
  };
}

export function isRecoverable(channel: AiChannelRow) {
  return Boolean(channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now());
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
