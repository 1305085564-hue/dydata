import type { Video, VideoMetricsSnapshot, VideoTag } from "@/types";

export type AnalyticsVideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

export type 可信度等级 = "low" | "medium" | "high";

export interface 结论指标项 {
  label: string;
  value: string;
}

export interface 结论候选项 {
  label: string;
  sampleCount: number;
  medianPlay: number;
  hotRate: number | null;
  lift: number | null;
}

export interface 干预项 {
  accountId: string;
  accountName: string;
  ownerName: string;
  dropRatio: number | null;
  triggerReasons: string[];
}

export interface 结论卡数据 {
  title: string;
  eyebrow: string;
  summary: string;
  sampleCount: number;
  confidence: 可信度等级;
  insufficient: boolean;
  metrics: 结论指标项[];
  footnote?: string;
}

export interface 干预结论卡数据 extends 结论卡数据 {
  items: 干预项[];
}

export interface 视频结论卡结果 {
  bestTopic: 结论卡数据;
  bestFormat: 结论卡数据;
  bestPublishHour: 结论卡数据;
  intervention: 干预结论卡数据;
}

export interface 视频结论卡Props {
  videos: AnalyticsVideoRow[];
  snapshots: VideoMetricsSnapshot[];
  videoTags: VideoTag[];
}
