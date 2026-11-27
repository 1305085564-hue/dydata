import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Metric } from "@/components/ui/metric";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  InteractionBreakdownContent,
  OverallGradeBreakdownContent,
  RetentionBreakdownContent,
} from "@/components/admin/quality-tooltip-content";
import { getContentOwner } from "@/lib/content/content-owner";
import { contentQualityRules } from "@/lib/content-quality";
import { getContentQualityStatusText, type WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { isImpossibleRatio, describeImpossibleRatio } from "@/lib/metric-bounds";
import { resolveVideoStatusLabel, describeAnomalyReason } from "@/lib/video-anomaly";
import {
  BREAKOUT_GRADE_TEXT_CLASS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  formatAchievement,
  type BreakoutRating,
} from "@/lib/breakout-rating";
import type { VideoMetricsSnapshot } from "@/types";
import type { VideoRow } from "@/lib/content/domain/detail";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPercentagePoints,
  getAvgPlayDurationClass,
  getAvgPlayRatioClass,
  getBounceRate2sClass,
  getCompletionRate5sClass,
  getCompletionRateClass,
  statusBadgeConfig,
} from "@/lib/content/domain/detail";
import { avgPlayRatioAsPercentagePoints, DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";

/**
 * 作品诊断正文上半部：这一屏只回答「这条表现怎么样」。
 * 标题下一句结论（综合评级 + 卡住它的那条线）→ 四个核心数平铺 → 全量指标折成一行摘要。
 * 不用灰底卡片、不配装饰图标；口径收进悬停。
 */

function getPlayThresholdLabel(playCount: number | null | undefined): string {
  if (playCount == null || !Number.isFinite(playCount)) return "暂无播放数据";
  if (playCount >= KPI_PLAY_EXCELLENT) return "已过 1.5 万线（评级不封顶）";
  if (playCount >= KPI_PLAY_GOOD) return "未满 1.5 万线（最高评良）";
  if (playCount >= KPI_PLAY_FLOOR) return "未满 5 千线（最高评普）";
  return "不足 2 千（直接判普）";
}

function getLowSampleTitle(playCount: number | null | undefined, standards = DEFAULT_EVALUATION_STANDARDS) {
  if (playCount == null || playCount >= standards.minPlayCount) return undefined;
  return `播放量不足 ${standards.minPlayCount.toLocaleString("zh-CN")}，样本不足，仅供参考`;
}

const RETENTION_CALCULATION_TEXT: Record<string, string> = {
  avg_play_duration_only: "按均播折算",
  avg_play_ratio_only: "按占比折算",
  average: "五项加权",
};

/** 带口径的标签：有说明才出虚线和悬停，没有就是一行灰字。 */
function TipLabel({ tip, wide = false, children }: { tip?: ReactNode; wide?: boolean; children: ReactNode }) {
  const label = (
    <span className={tip ? "cursor-help border-b border-dashed border-[#D6D3D1] hover:border-[#78716C] transition-colors duration-150" : undefined}>
      {children}
    </span>
  );
  if (!tip) return label;
  return (
    <SimpleTooltip
      align="start"
      sideOffset={6}
      contentClassName={wide ? "w-[264px] max-w-[264px] flex-col items-stretch gap-2 p-3 text-left" : undefined}
      tip={tip}
    >
      {label}
    </SimpleTooltip>
  );
}

function Stat({ label, tip, wideTip, value, settleKey, note }: {
  label: string;
  tip?: ReactNode;
  wideTip?: boolean;
  value: string;
  settleKey: string;
  note: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] text-[#78716C]">
        <TipLabel tip={tip} wide={wideTip}>{label}</TipLabel>
      </span>
      <Metric settleKey={settleKey} value={value} />
      <span className="truncate text-[12px] text-[#78716C] tabular-nums">{note}</span>
    </div>
  );
}

/** 比率明细值：越界（>100%）时覆盖语义色，按脏值样式打出并给出说明，不再冒充正常信号 */
function MetricPercentValue({ value, playCount, normalClassName, standards = DEFAULT_EVALUATION_STANDARDS, avgPlayRatio = false }: { value: number | null | undefined; playCount?: number | null; normalClassName?: string; standards?: EvaluationStandards; avgPlayRatio?: boolean }) {
  const percentageValue = avgPlayRatio ? avgPlayRatioAsPercentagePoints(value) : value;
  const dirty = isImpossibleRatio(percentageValue);
  const lowSampleTitle = value != null ? getLowSampleTitle(playCount, standards) : undefined;
  const tip = dirty ? describeImpossibleRatio() : lowSampleTitle;
  const label = (
    <span className={`tabular-nums ${dirty ? "text-status-danger underline decoration-status-danger/60 decoration-dotted underline-offset-2" : normalClassName ?? "text-[#141413]"} ${tip ? "cursor-help" : ""}`}>
      {formatPercentagePoints(percentageValue)}
    </span>
  );
  return tip ? <SimpleTooltip align="end" tip={tip}>{label}</SimpleTooltip> : label;
}

function MetricLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#E2E2DF]/60 py-1">
      <span className="text-[#78716C]">{label}</span>
      {children}
    </div>
  );
}

export interface ContentDetailMetricsProps {
  evaluationStandards?: EvaluationStandards;
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  canPurge: boolean;
  isPurgeEligible: (trashedAt: string | null | undefined) => boolean;
  followerConv: number | null;
  fanConv: number | null;
  followerRating: BreakoutRating | null;
  contentQuality?: WorkContentQuality | null;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
}

/** 提醒：为什么点进来要处理这条、回收站保护期。没有就不出。 */
export function ContentDetailNotices({ video, canPurge, isPurgeEligible }: Pick<ContentDetailMetricsProps, "video" | "canPurge" | "isPurgeEligible">) {
  // 用户点「去盘 →」是带着「系统认为这条有问题」的预期进来的，口径与提醒条分桶同源（2026-10-11 审计 High）
  const anomalyReason = describeAnomalyReason(video);
  const protectedUntil =
    video.lifecycle_state === "trashed" && canPurge && video.trashed_at && !isPurgeEligible(video.trashed_at)
      ? new Date(new Date(video.trashed_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleString("zh-CN")
      : null;
  const settlementExcluded = video.settlement_excluded === true;
  if (!anomalyReason && !protectedUntil && !settlementExcluded) return null;
  return (
    <div className="space-y-2">
      {settlementExcluded && (
        <Alert variant="warning" className="items-start text-[12px]">
          <div>
            该作品在事后核查中被标为无效，不计入文案优条数结算
            {video.settlement_excluded_reason ? `（原因：${video.settlement_excluded_reason}）` : ""}。
          </div>
        </Alert>
      )}
      {anomalyReason && (
        <Alert variant="warning" className="items-start text-[12px]">
          <div>为什么需要处理这条：{anomalyReason}</div>
        </Alert>
      )}
      {protectedUntil && (
        <Alert variant="warning" className="items-start text-[12px]">
          <div>
            回收站保护期内，<span className="tabular-nums text-[#1F1E1D]">{protectedUntil}</span> 之后才能彻底删除。
          </div>
        </Alert>
      )}
    </div>
  );
}

/** 标题区：一行出处、作品标题、一句结论。 */
export function ContentDetailHeadline({ video, snapshot, contentQuality = null, evaluationStandards = DEFAULT_EVALUATION_STANDARDS, ownerNames, onSelectAuthor }: Pick<ContentDetailMetricsProps, "video" | "snapshot" | "contentQuality" | "evaluationStandards" | "ownerNames" | "onSelectAuthor">) {
  const owner = onSelectAuthor || ownerNames
    ? getContentOwner(video, ownerNames)
    : { id: video.user_id, name: video.profiles.name };
  const statusLabel = resolveVideoStatusLabel({ anomalyStatus: video.anomaly_status });
  const playCount = contentQuality?.snapshotPlayCount ?? snapshot?.play_count ?? null;
  const overallGrade = contentQuality?.overallGrade ?? null;
  const rules = contentQualityRules(evaluationStandards);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#78716C]">
        {video.lifecycle_state === "trashed" && <Badge variant="secondary">回收站</Badge>}
        {video.settlement_excluded === true && <Badge variant="secondary">不计优结算</Badge>}
        {statusLabel !== "正常" && (
          <Badge variant={statusBadgeConfig[statusLabel]?.variant ?? "secondary"}>{statusLabel}</Badge>
        )}
        <span className="text-[#1F1E1D]">{video.accounts.name}</span>
        <span className="text-[#A8A29E]">·</span>
        {owner.id && onSelectAuthor ? (
          <SimpleTooltip align="start" tip={`查看 ${owner.name} 的全部作品`}>
            <button
              type="button"
              onClick={() => onSelectAuthor(owner.id, owner.name)}
              className="text-[#1F1E1D] underline decoration-[#78716C]/40 underline-offset-2 hover:text-[#141413] transition-colors duration-150 cursor-pointer"
            >
              {owner.name}
            </button>
          </SimpleTooltip>
        ) : (
          <span className="text-[#1F1E1D]">{owner.name}</span>
        )}
        <span className="text-[#A8A29E]">·</span>
        <span className="tabular-nums">{formatDateTime(video.published_at ?? null)} 发布</span>
      </div>

      <h2 className="font-serif text-[20px] leading-[1.30] text-[#141413] break-words">
        {video.video_title?.trim() || "未命名视频"}
      </h2>

      <p className="text-[14px] leading-[1.50] text-[#78716C]">
        {overallGrade && contentQuality ? (
          <SimpleTooltip
            align="start"
            contentClassName="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
            tip={<OverallGradeBreakdownContent quality={{ ...contentQuality, overallGrade }} playCount={playCount} rules={rules} />}
          >
            <span className={`cursor-help border-b border-dashed border-[#D6D3D1] ${BREAKOUT_GRADE_TEXT_CLASS[overallGrade]}`}>
              综合评{overallGrade}
            </span>
          </SimpleTooltip>
        ) : (
          <span className="text-[#1F1E1D]">
            暂不评级{contentQuality ? `（${getContentQualityStatusText(contentQuality.status)}）` : ""}
          </span>
        )}
        <span className="mx-2 text-[#A8A29E]">·</span>
        播放 {getPlayThresholdLabel(playCount)}
      </p>
    </section>
  );
}

/** 四个核心数：播放 / 转粉率 / 互动达成 / 留存达成，同一排平铺。 */
export function ContentDetailCoreStats({ snapshot, contentQuality = null, followerConv, followerRating, evaluationStandards = DEFAULT_EVALUATION_STANDARDS }: Pick<ContentDetailMetricsProps, "snapshot" | "contentQuality" | "followerConv" | "followerRating" | "evaluationStandards">) {
  const rules = contentQualityRules(evaluationStandards);
  const hasInteractionDetail = Boolean(contentQuality?.interactionMetrics || contentQuality?.interactionValue != null);
  const hasRetentionDetail = Boolean(contentQuality?.retentionMetrics);
  const interactionValue = contentQuality?.interactionValue;

  return (
    <section className="grid grid-cols-2 gap-5 border-y border-[#E2E2DF]/60 py-4 sm:grid-cols-4">
      <Stat
        label="播放"
        settleKey="content-detail:play"
        value={formatNumber(snapshot?.play_count)}
        tip={`播放 ${KPI_PLAY_FLOOR.toLocaleString()} 以下直接评普，${KPI_PLAY_GOOD.toLocaleString()} 以下最高评普，${KPI_PLAY_EXCELLENT.toLocaleString()} 以下最高评良。`}
        note={`抓取于 ${formatDateTime(snapshot?.captured_at ?? null)}`}
      />
      <Stat
        label="转粉率"
        settleKey="content-detail:follower-rate"
        value={formatPercent(followerConv)}
        tip={followerRating ? `转粉率达成 ${formatAchievement(followerRating.achievement)}，评${followerRating.grade}` : undefined}
        note={
          <>
            涨粉 +{formatNumber(snapshot?.follower_gain)}
            {followerRating && (
              <span className={`ml-2 ${BREAKOUT_GRADE_TEXT_CLASS[followerRating.grade]}`}>
                {followerRating.grade} {formatAchievement(followerRating.achievement)}
              </span>
            )}
          </>
        }
      />
      <Stat
        label="互动达成"
        settleKey="content-detail:interaction-rate"
        value={formatAchievement(contentQuality?.interactionAchievement)}
        wideTip
        tip={hasInteractionDetail ? <InteractionBreakdownContent quality={contentQuality} playCount={snapshot?.play_count} rules={rules} /> : undefined}
        note={interactionValue != null ? `互动率 ${(interactionValue * 100).toFixed(2)}%` : "赞 评 转 藏合计"}
      />
      <Stat
        label="留存达成"
        settleKey="content-detail:retention-achievement"
        value={formatAchievement(contentQuality?.contentAchievement)}
        wideTip
        tip={hasRetentionDetail ? <RetentionBreakdownContent quality={contentQuality} rules={rules} /> : undefined}
        note={
          <>
            {RETENTION_CALCULATION_TEXT[contentQuality?.retentionCalculation ?? "average"]}
            {contentQuality?.contentGrade && (
              <span className={`ml-2 ${BREAKOUT_GRADE_TEXT_CLASS[contentQuality.contentGrade]}`}>{contentQuality.contentGrade}</span>
            )}
          </>
        }
      />
    </section>
  );
}

/** 全量指标：有截图时默认折成一行摘要让位截图；截图没就绪时自动展开兜底。 */
export function ContentDetailAllMetrics({ snapshot, fanConv, hasAvailableScreenshots = true, evaluationStandards = DEFAULT_EVALUATION_STANDARDS }: {
  snapshot: VideoMetricsSnapshot | null;
  fanConv: number | null;
  hasAvailableScreenshots?: boolean;
  evaluationStandards?: EvaluationStandards;
}) {
  if (!snapshot) return null;
  const lowSampleTip = snapshot.avg_play_duration != null ? getLowSampleTitle(snapshot.play_count, evaluationStandards) : undefined;
  const avgDuration = (
    <span className={`tabular-nums ${getAvgPlayDurationClass(snapshot.avg_play_duration, snapshot.play_count, evaluationStandards) || "text-[#141413]"} ${lowSampleTip ? "cursor-help" : ""}`}>
      {formatDuration(snapshot.avg_play_duration)}
    </span>
  );
  return (
    <details
      key={hasAvailableScreenshots ? "collapsed" : "expanded"}
      open={!hasAvailableScreenshots}
      className="group/metrics"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-1 text-[12px] text-[#78716C] select-none hover:text-[#141413] transition-colors duration-150">
        <span className="min-w-0 truncate tabular-nums">
          <span className="text-[14px] text-[#141413]">全部指标</span>
          <span className="ml-2">
            点赞 {formatNumber(snapshot.likes)} · 评论 {formatNumber(snapshot.comments)} · 完播 {formatPercentagePoints(snapshot.completion_rate)} · 均播 {formatDuration(snapshot.avg_play_duration)}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform duration-150 group-open/metrics:rotate-180" aria-hidden />
      </summary>

      <div className="grid grid-cols-2 gap-x-5 pt-2 text-[12px] sm:grid-cols-3">
        <MetricLine label="点赞"><span className="tabular-nums text-[#141413]">{formatNumber(snapshot.likes)}</span></MetricLine>
        <MetricLine label="评论"><span className="tabular-nums text-[#141413]">{formatNumber(snapshot.comments)}</span></MetricLine>
        <MetricLine label="分享"><span className="tabular-nums text-[#141413]">{formatNumber(snapshot.shares)}</span></MetricLine>
        <MetricLine label="收藏"><span className="tabular-nums text-[#141413]">{formatNumber(snapshot.favorites)}</span></MetricLine>
        <MetricLine label="涨粉"><span className="tabular-nums text-[#141413]">+{formatNumber(snapshot.follower_gain)}</span></MetricLine>
        <MetricLine label="掉粉"><span className="tabular-nums text-[#141413]">-{formatNumber(snapshot.follower_loss)}</span></MetricLine>
        <MetricLine label="导粉"><span className="tabular-nums text-[#141413]">{formatNumber(snapshot.follower_convert)}</span></MetricLine>
        <MetricLine label="导粉率"><span className="tabular-nums text-[#141413]">{formatPercent(fanConv)}</span></MetricLine>
        <MetricLine label="2 秒跳出率">
          <MetricPercentValue standards={evaluationStandards} value={snapshot.bounce_rate_2s} playCount={snapshot.play_count} normalClassName={getBounceRate2sClass(snapshot.bounce_rate_2s, snapshot.play_count, evaluationStandards) || undefined} />
        </MetricLine>
        <MetricLine label="5 秒完播率">
          <MetricPercentValue standards={evaluationStandards} value={snapshot.completion_rate_5s} playCount={snapshot.play_count} normalClassName={getCompletionRate5sClass(snapshot.completion_rate_5s, snapshot.play_count, evaluationStandards) || undefined} />
        </MetricLine>
        <MetricLine label="完播率">
          <MetricPercentValue standards={evaluationStandards} value={snapshot.completion_rate} playCount={snapshot.play_count} normalClassName={getCompletionRateClass(snapshot.completion_rate, snapshot.play_count, evaluationStandards) || undefined} />
        </MetricLine>
        <MetricLine label="平均播放时长">
          {lowSampleTip ? <SimpleTooltip align="end" tip={lowSampleTip}>{avgDuration}</SimpleTooltip> : avgDuration}
        </MetricLine>
        <MetricLine label="平均播放占比">
          <MetricPercentValue standards={evaluationStandards} value={snapshot.avg_play_ratio} playCount={snapshot.play_count} avgPlayRatio normalClassName={getAvgPlayRatioClass(snapshot.avg_play_ratio, snapshot.play_count, evaluationStandards) || undefined} />
        </MetricLine>
      </div>
    </details>
  );
}
