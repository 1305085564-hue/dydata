import type { MarketContextDaily, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

export type CurvePattern = {
  pattern: "前高后低" | "平稳增长" | "二次起量" | "低开高走" | "断崖式";
  firstPeakPosition: string | null;
  dropSeverity: "high" | "medium" | "low" | null;
  tailStrength: "high" | "medium" | "low" | null;
  confidence: number | null;
};

export type BounceSegmentSummary = {
  segment: string;
  performance: string;
};

export type BounceAnalysis = {
  bouncePeakTime: string | null;
  replayPeakTime: string | null;
  segmentSummary: BounceSegmentSummary[];
};

export type VideoHistorySample = {
  video_id: string;
  published_at: string | null;
  play_count_24h: number | null;
};

export type MarketContextInput = Pick<
  MarketContextDaily,
  "context_date" | "is_trading_day" | "market_change" | "market_sentiment" | "hot_sectors"
>;

export type VideoDiagnoseInput = {
  video: Pick<Video, "id" | "video_title" | "content" | "published_at" | "anomaly_status">;
  snapshot24h: Pick<
    VideoMetricsSnapshot,
    | "play_count"
    | "likes"
    | "comments"
    | "shares"
    | "favorites"
    | "follower_gain"
    | "follower_loss"
    | "homepage_visits"
    | "follower_convert"
    | "fan_play_ratio"
    | "cover_click_rate"
    | "avg_play_duration"
    | "completion_rate"
    | "bounce_rate_2s"
    | "completion_rate_5s"
    | "avg_play_ratio"
    | "curve_screenshot_url"
    | "retention_screenshot_url"
    | "screenshot_urls"
  >;
  tags: Array<Pick<VideoTag, "tag_dimension" | "tag_value" | "source" | "confidence">>;
  curvePattern: CurvePattern | null;
  bounceAnalysis: BounceAnalysis | null;
  marketContext: MarketContextInput | null;
  sameAccountHistory: VideoHistorySample[];
  accountBaselineMedian: number | null;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value: number | null) {
  return value == null ? "无" : String(value);
}

function formatPercent(value: number | null) {
  return value == null ? "无" : `${(value * 100).toFixed(2)}%`;
}

function formatTags(tags: VideoDiagnoseInput["tags"]) {
  if (!tags.length) return "无";
  return tags.map((tag) => `${tag.tag_dimension}=${tag.tag_value}`).join("；");
}

function formatHistory(history: VideoHistorySample[]) {
  if (!history.length) return "无";
  return history
    .map((item) => `${item.published_at ?? "无时间"} / 24h播放=${item.play_count_24h ?? "无"}`)
    .join("\n");
}

function formatCurvePattern(curvePattern: CurvePattern | null) {
  if (!curvePattern) return "无";
  return [
    `模式=${curvePattern.pattern}`,
    `首峰位置=${curvePattern.firstPeakPosition ?? "无"}`,
    `掉速强度=${curvePattern.dropSeverity ?? "无"}`,
    `尾部承接=${curvePattern.tailStrength ?? "无"}`,
    `置信度=${formatNumber(curvePattern.confidence)}`,
  ].join("；");
}

function formatBounceAnalysis(bounceAnalysis: BounceAnalysis | null) {
  if (!bounceAnalysis) return "无";
  const segments = bounceAnalysis.segmentSummary.length
    ? bounceAnalysis.segmentSummary.map((item) => `${item.segment}:${item.performance}`).join("；")
    : "无";
  return [
    `跳出峰值=${bounceAnalysis.bouncePeakTime ?? "无"}`,
    `回看峰值=${bounceAnalysis.replayPeakTime ?? "无"}`,
    `分段表现=${segments}`,
  ].join("；");
}

function formatMarketContext(marketContext: MarketContextInput | null) {
  if (!marketContext) return "无";
  const marketChange = marketContext.market_change
    ? Object.entries(marketContext.market_change)
        .map(([key, value]) => `${key}:${value}`)
        .join("，")
    : "无";
  const sectors = marketContext.hot_sectors?.length ? marketContext.hot_sectors.join("、") : "无";
  return [
    `日期=${marketContext.context_date}`,
    `交易日=${marketContext.is_trading_day ? "是" : "否"}`,
    `市场情绪=${marketContext.market_sentiment ?? "无"}`,
    `市场变化=${marketChange}`,
    `热点板块=${sectors}`,
  ].join("；");
}

export function calculateAccountBaselineMedian(history: VideoHistorySample[]) {
  const values = [...history]
    .sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 30)
    .map((item) => item.play_count_24h)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return median(values);
}

export function findMarketContextForPublishedAt(
  publishedAt: string | null,
  contexts: MarketContextDaily[]
): MarketContextDaily | null {
  if (!publishedAt) return null;
  const date = publishedAt.slice(0, 10);
  return contexts.find((context) => context.context_date === date) ?? null;
}

export function buildVideoDiagnosePrompt(input: VideoDiagnoseInput) {
  return [
    "你是短视频增长诊断分析师。请基于以下信息完成诊断。",
    "输出目标：先判断这条视频表现的主因，再给出具体问题段落、证据和改法。",
    "请严格输出 JSON，不要输出 markdown，不要补充额外解释。",
    "JSON 字段固定为：main_reason, problem_segment, evidence, improvement, confidence。",
    "其中内容必须严格覆盖五步：主因判断 → 问题段落 → 证据 → 改法 → 置信度。",
    "",
    "【视频基础】",
    `视频ID：${input.video.id}`,
    `标题：${input.video.video_title ?? "无"}`,
    `内容摘要：${input.video.content ?? "无"}`,
    `发布时间：${input.video.published_at ?? "无"}`,
    `异常状态：${input.video.anomaly_status}`,
    "",
    "【24h数据快照】",
    `播放：${input.snapshot24h.play_count}`,
    `点赞：${input.snapshot24h.likes}`,
    `评论：${input.snapshot24h.comments}`,
    `分享：${input.snapshot24h.shares}`,
    `收藏：${input.snapshot24h.favorites}`,
    `涨粉：${input.snapshot24h.follower_gain}`,
    `掉粉：${input.snapshot24h.follower_loss}`,
    `主页访问：${input.snapshot24h.homepage_visits}`,
    `导粉：${input.snapshot24h.follower_convert}`,
    `粉播比：${formatPercent(input.snapshot24h.fan_play_ratio)}`,
    `封面点击率：${formatPercent(input.snapshot24h.cover_click_rate)}`,
    `平均播放时长：${formatNumber(input.snapshot24h.avg_play_duration)}`,
    `完播率：${formatPercent(input.snapshot24h.completion_rate)}`,
    `2秒跳出率：${formatPercent(input.snapshot24h.bounce_rate_2s)}`,
    `5秒完播率：${formatPercent(input.snapshot24h.completion_rate_5s)}`,
    `平均播完比：${formatPercent(input.snapshot24h.avg_play_ratio)}`,
    "",
    "【标签】",
    `标签：${formatTags(input.tags)}`,
    "",
    "【曲线模式】",
    `曲线模式：${formatCurvePattern(input.curvePattern)}`,
    "",
    "【跳出分析】",
    `跳出分析：${formatBounceAnalysis(input.bounceAnalysis)}`,
    "",
    "【市场环境】",
    `市场环境：${formatMarketContext(input.marketContext)}`,
    "",
    "【同账号历史】",
    `账号近30条24h播放中位数：${formatNumber(input.accountBaselineMedian)}`,
    `同账号历史：${formatHistory(input.sameAccountHistory)}`,
    "",
    "诊断要求：",
    "1. 优先判断是内容选题、表达结构、开头留存、转化设计、还是市场环境导致。",
    "2. 问题段落要尽量指出具体时间段或结构段落。",
    "3. 证据必须引用上面的数据、曲线、跳出、标签、历史基线或市场环境。",
    "4. 改法只给最关键、最可执行的 1-3 条。",
    "5. 置信度输出 0-1 之间的小数。",
  ].join("\n");
}
