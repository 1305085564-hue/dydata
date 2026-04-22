import type { Video, VideoMetricsSnapshot, VideoTag } from "@/types";

export type AnalyticsVideoRow = Video & {
  accounts?: { name: string } | null;
  profiles?: { name: string } | null;
};

export type ConfidenceLevel = "low" | "medium" | "high";

export interface ConclusionMetricItem {
  label: string;
  value: string;
}

export interface ConclusionCandidate {
  label: string;
  sampleCount: number;
  medianPlay: number;
  hotRate: number | null;
  lift: number | null;
}

export interface InterventionItem {
  accountId: string;
  accountName: string;
  ownerName: string;
  dropRatio: number | null;
  triggerReasons: string[];
}

export interface ConclusionCardData {
  title: string;
  eyebrow: string;
  summary: string;
  sampleCount: number;
  confidence: ConfidenceLevel;
  insufficient: boolean;
  metrics: ConclusionMetricItem[];
  footnote?: string;
}

export interface InterventionConclusionCardData extends ConclusionCardData {
  items: InterventionItem[];
}

export interface VideoConclusionCardsResult {
  bestTopic: ConclusionCardData;
  bestFormat: ConclusionCardData;
  bestPublishHour: ConclusionCardData;
  intervention: InterventionConclusionCardData;
}

export interface VideoConclusionCardProps {
  videos: AnalyticsVideoRow[];
  snapshots: VideoMetricsSnapshot[];
  videoTags: VideoTag[];
  onNavigate?: (
    target: "hit-analyzer" | "personnel-analysis" | "time-analysis",
    ownerName?: string | null,
  ) => void;
}

export type 可信度等级 = ConfidenceLevel;
export type 结论指标项 = ConclusionMetricItem;
export type 结论候选项 = ConclusionCandidate;
export type 干预项 = InterventionItem;
export type 结论卡数据 = ConclusionCardData;
export type 干预结论卡数据 = InterventionConclusionCardData;
export type 视频结论卡结果 = VideoConclusionCardsResult;
export type 视频结论卡Props = VideoConclusionCardProps;
