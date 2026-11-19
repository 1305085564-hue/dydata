/**
 * AI 调用统计接口 GET /api/admin/ai-config/call-stats 的返回结构（前后端共用这一份）。
 * 口径见 docs/plans/2026-11-19-AI配置异常优先重排方案.md「两个指标的口径」：
 * - recent1000：最近 1000 次；recent：近 3 天内最近 50 次（3 天内没有调用时 calls = 0、两个值为 null）
 * - successRate 为 0–1 小数；avgMs 只算成功调用的平均耗时
 * - 手动检测（isProbe）不计入任何统计，只出现在 recentFailures
 */
export const CALL_STATS_PATH = "/api/admin/ai-config/call-stats";

export type CallStatsWindow = { calls: number; successRate: number | null; avgMs: number | null };

export type ChannelCallStats = {
  keyModelId: string;
  modelId: string;
  recent1000: CallStatsWindow;
  recent: CallStatsWindow;
  lastFailure: { at: string; kind: string; message: string; featureKey: string | null } | null;
};

export type FeatureCallStats = {
  featureKey: string;
  recent1000: CallStatsWindow & { rescuedCount: number };
  recent: CallStatsWindow & { rescuedCount: number };
};

export type RecentCallFailure = {
  at: string;
  featureKey: string | null;
  modelId: string;
  keyModelId: string;
  kind: string;
  message: string;
  rescued: boolean;
  isProbe: boolean;
};

export type CallStats = {
  generatedAt: string;
  channels: ChannelCallStats[];
  features: FeatureCallStats[];
  recentFailures: RecentCallFailure[];
};

/** 逐次调用记录从这天开始攒（迁移 20261119122350 上线日）；此前没有成功率与耗时数据。 */
export const CALL_RECORDING_SINCE_LABEL = "11 月 19 日";
