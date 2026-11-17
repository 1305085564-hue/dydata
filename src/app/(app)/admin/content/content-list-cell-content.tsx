import type { ComponentProps, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  InteractionBreakdownContent,
  RetentionBreakdownContent,
} from "@/components/admin/quality-tooltip-content";
import { contentQualityRules } from "@/lib/content-quality";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
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

/** 颜色与提示共用公司标准；越界比率优先显示数据异常。
 *  单指标正常格保持安静无气泡；仅优质/需关注/样本不足/异常时整格激活悬停提示。 */
export function RatioCell({
  value,
  lowSample = false,
  metricType,
  achievement,
  className = "",
  cellClassName = "px-2",
  fullCell = false,
  standards = DEFAULT_EVALUATION_STANDARDS,
}: {
  value: number | null | undefined;
  lowSample?: boolean;
  metricType?: "bounce_rate_2s" | "completion_rate_5s" | "completion_rate" | "avg_play_duration" | "avg_play_ratio";
  achievement?: number | null;
  className?: string;
  cellClassName?: string;
  fullCell?: boolean;
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

  const number = <span className={cn(className, color)}>{text}</span>;

  if (!fullCell) {
    if (!title) return number;
    return (
      <Tooltip>
        <TooltipTrigger render={<span className={cn(className, color, "cursor-help")}>{text}</span>} />
        <TooltipContent side="top" align="end">{title}</TooltipContent>
      </Tooltip>
    );
  }

  if (!title) {
    return (
      <div className={cn("flex h-full w-full items-center justify-end py-2.5", cellClassName)}>
        {number}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className={cn("flex h-full w-full items-center justify-end py-2.5 cursor-help", cellClassName)}>
            {number}
          </div>
        }
      />
      <TooltipContent side="top" align="end">{title}</TooltipContent>
    </Tooltip>
  );
}

export function DurationCell(props: Omit<ComponentProps<typeof RatioCell>, "metricType">) {
  return <RatioCell {...props} metricType="avg_play_duration" />;
}

/** 互动率合成列：整格悬停展示点赞/评论/转发/收藏拆解与标准对比，点击直透行点击。 */
export function InteractionRateTooltipCell({
  value,
  quality,
  playCount,
  lowSample = false,
  highlightClass = "",
  standards = DEFAULT_EVALUATION_STANDARDS,
}: {
  value: number | null | undefined;
  quality: WorkContentQuality | null | undefined;
  playCount: number | null | undefined;
  lowSample?: boolean;
  highlightClass?: string;
  standards?: EvaluationStandards;
}) {
  const dirty = isImpossibleRatio(value);
  const achievement = quality?.interactionAchievement;
  const tone = evaluationTone("interactionAchievement", achievement, undefined, standards);
  const text = formatPercent(value);

  let color = "";
  let extraNote: string | undefined;
  if (dirty) {
    color = "text-status-danger";
    extraNote = describeImpossibleRatio();
  } else if (lowSample) {
    color = "text-[#A8A29E]";
    extraNote = `播放量不足 ${standards.minPlayCount.toLocaleString("zh-CN")}，样本不足，仅供参考`;
  } else if (tone !== "normal") {
    color = tone === "good" ? "text-status-danger" : "text-status-success";
  }

  const hasDetail = Boolean(quality?.interactionMetrics || value != null);
  if (!hasDetail) {
    return (
      <div className="flex h-full w-full items-center justify-end py-2.5 px-2 text-[#A8A29E]">
        —
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="group/cell flex h-full w-full items-center justify-end py-2.5 px-2 cursor-help">
            <span
              className={cn(
                highlightClass,
                color,
                "border-b border-dashed border-[#D6D3D1] group-hover/cell:border-[#78716C] transition-colors",
              )}
            >
              {text}
            </span>
          </div>
        }
      />
      <TooltipContent
        side="top"
        align="end"
        sideOffset={4}
        className="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
      >
        <InteractionBreakdownContent
          quality={quality}
          playCount={playCount}
          rules={contentQualityRules(standards)}
          extraNote={extraNote}
        />
      </TooltipContent>
    </Tooltip>
  );
}

/** 留存达成合成列：整格悬停展示子项达标率与折算说明，点击直透行点击。 */
export function RetentionAchievementTooltipCell({
  quality,
  standards = DEFAULT_EVALUATION_STANDARDS,
}: {
  quality: WorkContentQuality | null | undefined;
  standards?: EvaluationStandards;
}) {
  if (quality?.contentAchievement == null) {
    return (
      <div className="flex h-full w-full items-center justify-end py-2.5 px-2 text-[#A8A29E]">
        —
      </div>
    );
  }

  const pct = Math.round(quality.contentAchievement);
  const rules = contentQualityRules(standards);
  const hasDetail = Boolean(quality.retentionMetrics);

  if (!hasDetail) {
    return (
      <div className="flex h-full w-full items-center justify-end py-2.5 px-2">
        {pct}%
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="group/cell flex h-full w-full items-center justify-end py-2.5 px-2 cursor-help">
            <span className="border-b border-dashed border-[#D6D3D1] group-hover/cell:border-[#78716C] transition-colors">
              {pct}%
            </span>
          </div>
        }
      />
      <TooltipContent
        side="top"
        align="end"
        sideOffset={4}
        className="w-[264px] max-w-[264px] flex-col items-stretch gap-2 p-3 text-left"
      >
        <RetentionBreakdownContent quality={quality} rules={rules} />
      </TooltipContent>
    </Tooltip>
  );
}

export function formatFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "发布日期未知";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "发布日期未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

/** 命中高亮的数值包一层淡琥珀 span；未命中保持原样，不改变既有配色冲突面 */
export function Highlightable({ hit, children }: { hit: boolean; children: ReactNode }) {
  if (!hit) return <>{children}</>;
  return <span className={HIGHLIGHT_CELL_CLASS}>{children}</span>;
}

/** 发布时间：单日显示时刻，多日显示月日；固定按北京时间（Asia/Shanghai）格式化，
 *  完整时间通过悬停 title 查看，节省横向空间释放给互动、留存等前排数据。 */
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
