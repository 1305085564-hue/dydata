import { ExternalLink, Play, Bookmark, Layers, UserCheck, TrendingUp, ThumbsUp, Sparkles } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Metric } from "@/components/ui/metric";
import { ListRow } from "@/components/ui/list-row";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { isImpossibleRatio, describeImpossibleRatio } from "@/lib/metric-bounds";
import { resolveVideoStatusLabel } from "@/lib/video-anomaly";
import { BREAKOUT_GRADE_TEXT_CLASS, KPI_PLAY_EXCELLENT, KPI_PLAY_FLOOR, KPI_PLAY_GOOD, formatAchievement, type BreakoutRating, type BreakoutGrade } from "@/lib/breakout-rating";
import type { VideoMetricsSnapshot } from "@/types";
import type { VideoRow } from "@/lib/content/domain/detail";
import { formatDateTime, formatDuration, formatNumber, formatPercent, formatPercentagePoints, formatTarget, getBounceRate2sClass, getCompletionRate5sClass, getCompletionRateClass, statusBadgeConfig } from "@/lib/content/domain/detail";

function MetricPercentValue({ value, normalClassName }: { value: number | null | undefined; normalClassName?: string }) {
  const dirty = isImpossibleRatio(value);
  return (
    <span className={`font-normal tabular-nums ${dirty ? "text-status-danger underline decoration-status-danger/60 decoration-dotted underline-offset-2 cursor-help" : normalClassName ?? ""}`} title={dirty ? describeImpossibleRatio() : undefined}>
      {formatPercentagePoints(value)}
    </span>
  );
}

function BreakoutGradeTag({ rating, metricLabel, targetLabel }: { rating: BreakoutRating | null; metricLabel: string; targetLabel: string }) {
  if (!rating) return null;
  return (
    <span className={`shrink-0 tabular-nums font-normal ${BREAKOUT_GRADE_TEXT_CLASS[rating.grade]}`} title={`${metricLabel}达成率 ${formatAchievement(rating.achievement)}（${rating.grade}），爆款标准 ${targetLabel}`}>
      {rating.grade}{formatAchievement(rating.achievement)}
    </span>
  );
}


export interface ContentDetailMetricsProps {
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  canPurge: boolean;
  isPurgeEligible: (trashedAt: string | null | undefined) => boolean;
  hasTopicKind: boolean;
  fourthSlotIsFavorite: boolean;
  fourthSlotLabel: string;
  fourthSlotValue: number | null;
  followerConv: number | null;
  fanConv: number | null;
  interaction: number | null;
  breakoutTargets: { follower: number; interaction: number; fourth: number } | null;
  followerRating: BreakoutRating | null;
  interactionRating: BreakoutRating | null;
  fourthRating: BreakoutRating | null;
  overallGrade: BreakoutGrade | null;
}

export function ContentDetailMetrics({ video, snapshot, canPurge, isPurgeEligible, hasTopicKind, fourthSlotIsFavorite, fourthSlotLabel, fourthSlotValue, followerConv, fanConv, interaction, breakoutTargets, followerRating, interactionRating, fourthRating, overallGrade }: ContentDetailMetricsProps) {
  return (
    <>
              {/* 锁定提示横幅 */}
              {video.lifecycle_state === "trashed" &&
                canPurge &&
                video.trashed_at &&
                !isPurgeEligible(video.trashed_at) && (
                  <Alert variant="warning" className="items-start text-[12px]">
                    <div>
                      <span className="font-normal">
                        作品处于回收站保护期：
                      </span>{" "}
                      移入未满 30 天，可于{" "}
                      <span className="font-normal tabular-nums text-[#1F1E1D]">
                        {new Date(
                          new Date(video.trashed_at).getTime() +
                            30 * 24 * 60 * 60 * 1000,
                        ).toLocaleString("zh-CN")}
                      </span>{" "}
                      之后执行彻底物理销毁。
                    </div>
                  </Alert>
                )}

              {/* 1. 顶部全景单大卡片 (视频元数据 + 爆款数据核心大盘 融为一体) */}
              <section className="space-y-5">
                {/* 1.1 视频元信息 header */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-[#E2E2DF]/60 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {video.lifecycle_state === "trashed" && (
                        <Badge
                          variant="secondary"
                          className="bg-[#F1F1F0] text-[#1F1E1D] text-[12px] font-normal"
                        >
                          回收站
                        </Badge>
                      )}
                      <Badge
                        variant={
                          statusBadgeConfig[
                            resolveVideoStatusLabel({ anomalyStatus: video.anomaly_status })
                          ]?.variant ?? "secondary"
                        }
                      >
                        {resolveVideoStatusLabel({ anomalyStatus: video.anomaly_status })}
                      </Badge>
                      <SectionHeading as="h2">
                        {video.video_title?.trim() || "未命名视频"}
                      </SectionHeading>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#78716C]">
                      <span className="flex items-center gap-1 font-normal text-[#1F1E1D]">
                        <span className="text-[#78716C]">账号:</span>{" "}
                        {video.accounts.name}
                      </span>
                      <span className="text-[#E2E2DF]">·</span>
                      <span className="flex items-center gap-1 font-normal text-[#1F1E1D]">
                        <UserCheck className="size-3.5 text-[#78716C]" />
                        <span className="text-[#78716C]">责任人:</span>{" "}
                        {video.profiles.name}
                      </span>
                      <span className="text-[#E2E2DF]">·</span>
                      <span>
                        <span className="text-[#78716C]">发布时间:</span>{" "}
                        <span className="tabular-nums">
                          {formatDateTime(video.published_at ?? null)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {video.video_url && (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[#E2E2DF] bg-white px-3 py-1.5 text-[12px] font-normal text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors shrink-0 shadow-input"
                    >
                      <ExternalLink className="size-3.5 text-[#D97757]" />
                      打开源视频网页
                    </a>
                  )}
                </div>

                {/* 1.2 爆款数据核心大盘 (融于同卡内) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-current text-[#D97757]" />
                      <h3 className="text-[13px] font-medium text-[#141413] tracking-tight">
                        爆款数据核心大盘
                      </h3>
                      {overallGrade && (
                        <Badge
                          variant="secondary"
                          className={`bg-[#F1F1F0] text-[12px] font-medium ${BREAKOUT_GRADE_TEXT_CLASS[overallGrade]}`}
                          title={`综合评级：互动率与${fourthSlotLabel}达成率取平均（不封顶），按 ≥100% 优 / ≥80% 良 / ≥60% 普 / <60% 劣落档；播放 < ${KPI_PLAY_FLOOR.toLocaleString()} 判劣，≥ ${KPI_PLAY_FLOOR.toLocaleString()} / ${KPI_PLAY_GOOD.toLocaleString()} / ${KPI_PLAY_EXCELLENT.toLocaleString()} 分别最高普 / 良 / 优；最终取较低档，转粉率不参与`}
                        >
                          综合{overallGrade}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[12px] text-[#78716C] font-normal">
                      {!hasTopicKind && "话题未识别，暂不评级 · "}
                      抓取时间: {formatDateTime(snapshot?.captured_at ?? null)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* 播放量 */}
                    <div className="relative overflow-hidden rounded-xl bg-[#F1F1F0] p-3.5 transition-all hover:bg-[#EBEBE9]">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center justify-between">
                        <span>播放量</span>
                        <Play className="size-3.5 text-[#78716C]" />
                      </div>
                      <Metric
                        value={formatNumber(snapshot?.play_count)}
                        className="mt-1.5"
                      />
                      <div className="mt-0.5 text-[12px] text-[#78716C] font-normal">
                        {snapshot?.play_count && snapshot.play_count >= 100000
                          ? "🔥 爆款层级"
                          : "日常播放"}
                      </div>
                    </div>

                    {/* 转粉率 */}
                    <div className="relative overflow-hidden rounded-xl bg-[#F1F1F0] p-3.5 transition-all hover:bg-[#EBEBE9]">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center justify-between">
                        <span>转粉率</span>
                        <Sparkles className="size-3.5 text-[#78716C]" />
                      </div>
                      <Metric
                        value={formatPercent(followerConv)}
                        className="mt-1.5"
                      />
                      <div className="mt-0.5 flex items-center justify-between text-[12px] text-[#78716C] font-normal">
                        <span>
                          涨粉量:{" "}
                          <span className="tabular-nums font-normal text-[#1F1E1D]">
                            +{formatNumber(snapshot?.follower_gain)}
                          </span>
                        </span>
                        <BreakoutGradeTag
                          rating={followerRating}
                          metricLabel="转粉率"
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.follower) : ""}
                        />
                      </div>
                    </div>

                    {/* 互动率 */}
                    <div className="relative overflow-hidden rounded-xl bg-[#F1F1F0] p-3.5 transition-all hover:bg-[#EBEBE9]">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center justify-between">
                        <span>互动率</span>
                        <TrendingUp className="size-3.5 text-[#78716C]" />
                      </div>
                      <Metric
                        value={formatPercent(interaction)}
                        className="mt-1.5"
                      />
                      <div className="mt-0.5 flex items-center justify-between text-[12px] text-[#78716C] font-normal">
                        <span>赞/评/藏/转</span>
                        <BreakoutGradeTag
                          rating={interactionRating}
                          metricLabel="互动率"
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.interaction) : ""}
                        />
                      </div>
                    </div>

                    {/* 点赞率 / 收藏率：干货看收藏率，复盘及其他看点赞率 */}
                    <div className="relative overflow-hidden rounded-xl bg-[#F1F1F0] p-3.5 transition-all hover:bg-[#EBEBE9]">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center justify-between">
                        <span>{fourthSlotLabel}</span>
                        {fourthSlotIsFavorite ? (
                          <Bookmark className="size-3.5 text-[#78716C]" />
                        ) : (
                          <ThumbsUp className="size-3.5 text-[#78716C]" />
                        )}
                      </div>
                      <Metric
                        value={formatPercent(fourthSlotValue)}
                        className="mt-1.5"
                      />
                      <div className="mt-0.5 flex items-center justify-between text-[12px] text-[#78716C] font-normal">
                        <span>
                          {hasTopicKind ? (
                            <>
                              {fourthSlotIsFavorite ? "收藏" : "点赞"}{" "}
                              <span className="tabular-nums font-normal text-[#1F1E1D]">
                                {formatNumber(fourthSlotIsFavorite ? snapshot?.favorites : snapshot?.likes)}
                              </span>
                            </>
                          ) : (
                            "话题标签缺失"
                          )}
                        </span>
                        <BreakoutGradeTag
                          rating={fourthRating}
                          metricLabel={fourthSlotLabel}
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.fourth) : ""}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. 快照全量指标明细 (紧随爆款数据核心大盘下方) */}
              {snapshot && (
                <section className="border-t border-[#E2E2DF]/60 pt-5 mt-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-[#78716C]" />
                      <h3 className="text-[13px] font-medium text-[#141413] tracking-tight">
                        快照全量指标明细
                      </h3>
                    </div>
                    <span className="text-[12px] text-[#78716C] font-normal">
                      ({snapshot.snapshot_type} 抓取维度)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1 sm:grid-cols-3 xl:grid-cols-4 text-[12px]">
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">点赞数</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatNumber(snapshot.likes)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">评论数</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatNumber(snapshot.comments)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">分享数</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatNumber(snapshot.shares)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">收藏数</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatNumber(snapshot.favorites)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">涨粉量</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        +{formatNumber(snapshot.follower_gain)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">掉粉量</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        -{formatNumber(snapshot.follower_loss)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">导粉量</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatNumber(snapshot.follower_convert)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">导粉率</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatPercent(fanConv)}
                      </span>
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">2s 跳出率</span>
                      <MetricPercentValue
                        value={snapshot.bounce_rate_2s}
                        normalClassName={getBounceRate2sClass(snapshot.bounce_rate_2s)}
                      />
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">5s 完播率</span>
                      <MetricPercentValue
                        value={snapshot.completion_rate_5s}
                        normalClassName={getCompletionRate5sClass(snapshot.completion_rate_5s)}
                      />
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">完播率</span>
                      <MetricPercentValue
                        value={snapshot.completion_rate}
                        normalClassName={getCompletionRateClass(snapshot.completion_rate)}
                      />
                    </ListRow>
                    <ListRow className="py-1" keepLastBorder>
                      <span className="text-[#1F1E1D]">平均播放时长</span>
                      <span className="font-normal tabular-nums text-[#141413]">
                        {formatDuration(snapshot.avg_play_duration)}
                      </span>
                    </ListRow>
                  </div>
                </section>
              )}

              {/* 3. 数据截图证据 (智能自适应手机长图与电脑宽图，可单列大图/双列对照，支持点击全屏放大) */}
    </>
  );
}
