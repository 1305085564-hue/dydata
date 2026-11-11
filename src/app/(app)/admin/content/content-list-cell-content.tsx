import type { ComponentProps, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HIGHLIGHT_CELL_CLASS } from "@/lib/content/domain/content-list-highlight";
import { avgPlayRatioAsPercentagePoints, DEFAULT_EVALUATION_STANDARDS, EVALUATION_METRICS, evaluationTone, type EvaluationMetric, type EvaluationStandards } from "@/lib/evaluation-standards";
import { describeImpossibleRatio, isImpossibleRatio } from "@/lib/metric-bounds";
import { cn } from "@/lib/utils";

export function formatCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  if (absVal >= 100000000) {
    const num = (absVal / 100000000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}亿`;
  }
  if (absVal >= 10000) {
    const num = (absVal / 10000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}万`;
  }
  return String(val);
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}
/** 比率类指标（完播率 / 2s 跳出 / 互动率）物理上限 100%，下限 0%。
 *  越界说明上游采集或入库有脏数据：显示时照原值打出并打脏值标记（不掩盖问题），
 *  但排序时必须按无效值处理，否则「点表头找最差」会被一条不可能的 4773% 顶到榜首。 */

/** 颜色与提示共用公司标准；越界比率优先显示数据异常。 */
export function RatioCell({ value, lowSample = false, metricType, achievement, className = "", standards = DEFAULT_EVALUATION_STANDARDS }: {
  value: number | null | undefined;
  lowSample?: boolean;
  metricType?: "bounce_rate_2s" | "completion_rate_5s" | "completion_rate" | "avg_play_duration" | "avg_play_ratio";
  achievement?: number | null;
  className?: string;
  standards?: EvaluationStandards;
}) {
  const duration = metricType === "avg_play_duration";
  const isAvgPlayRatio = metricType === "avg_play_ratio";
  const percentageValue = isAvgPlayRatio ? avgPlayRatioAsPercentagePoints(value) : value;
  const dirty = !duration && isImpossibleRatio(percentageValue);
  const metric: EvaluationMetric | undefined = metricType === "bounce_rate_2s" ? "bounceRate2s"
    : metricType === "completion_rate_5s" ? "completionRate5s"
    : metricType === "completion_rate" ? "completionRate"
    : isAvgPlayRatio ? "avgPlayRatio"
    : duration ? "avgPlayDuration" : achievement != null ? "interactionAchievement" : undefined;
  const tone = metric ? evaluationTone(metric, metric === "interactionAchievement" ? achievement : percentageValue, undefined, standards) : "normal";
  const text = duration ? (value == null ? "—" : `${value.toFixed(1)}s`) : formatPercent(percentageValue);
  let title: string | undefined;
  let color = "";
  if (dirty) {
    color = "text-status-danger underline decoration-status-danger/60 decoration-dotted underline-offset-2";
    title = describeImpossibleRatio();
  } else if (lowSample) {
    color = "text-[#A8A29E]";
    title = `播放量不足 ${standards.minPlayCount.toLocaleString("zh-CN")}，样本不足，仅供参考`;
  } else if (metric && tone !== "normal") {
    color = tone === "good" ? "text-status-danger" : "text-status-success";
    const meta = EVALUATION_METRICS.find(({ key }) => key === metric)!;
    const operator = metric === "bounceRate2s" ? (tone === "good" ? "≤" : ">") : (tone === "good" ? "≥" : "≤");
    title = `${meta.label} ${operator}${standards[metric][tone]}${meta.unit} ${tone === "good" ? "表现优质" : "需要关注"}`;
  }
  const number = <span className={cn(className, color, title && "cursor-help")}>{text}</span>;
  return title ? <Tooltip><TooltipTrigger render={number} /><TooltipContent>{title}</TooltipContent></Tooltip> : number;
}

export function DurationCell(props: Omit<ComponentProps<typeof RatioCell>, "metricType">) {
  return <RatioCell {...props} metricType="avg_play_duration" />;
}

/** 命中高亮的数值包一层淡琥珀 span；未命中保持原样，不改变既有配色冲突面 */
export function Highlightable({ hit, children }: { hit: boolean; children: ReactNode }) {
  if (!hit) return <>{children}</>;
  return <span className={HIGHLIGHT_CELL_CLASS}>{children}</span>;
}

/** 发布时间：单日显示时刻，多日显示月日；固定按北京时间（Asia/Shanghai）格式化，
 *  完整时间通过悬停 title 查看，节省横向空间释放给核心指标等前排数据。 */
export function formatCompactDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("month")}-${read("day")}`;
}

/** 单日模式的发布时间：只显示时刻（HH:mm），时区口径与 formatCompactDate 一致 */
export function formatTimeOfDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("hour")}:${read("minute")}`;
}
