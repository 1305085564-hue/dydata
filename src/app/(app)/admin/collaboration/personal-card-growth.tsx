"use client";

import { Card } from "@/components/ui/card";
import { CHART_COLORS } from "@/lib/chart-palette";
import type { CollaborationRoleTab, PersonDetailData } from "./types";
import { formatBigNumber } from "./types";
import { WriterQualityChart } from "./writer-quality-chart";
import type { ChartWorkPoint } from "@/lib/collaboration/domain/person-metrics";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";

import { PersonalCardGrowthChart } from "./personal-card-growth-chart";

interface PersonalCardGrowthProps {
  data: PersonDetailData;
  activeTab?: CollaborationRoleTab;
  roleLabel: string;
  growthChartData: ChartWorkPoint[];
  growthAverages: {
    snapshotCount: number;
    avgPlay: number | null;
    avgInteraction: number | null;
    avgLike: number | null;
    avgFavorite: number | null;
  } | null;
  hoveredWork: ChartWorkPoint | null;
  visibleMetrics: { interaction: boolean; like: boolean; favorite: boolean };
  toggleMetric: (key: "interaction" | "like" | "favorite") => void;
  onHoverWork: (point: ChartWorkPoint) => void;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
  onClearHover: () => void;
}

export function PersonalCardGrowth({
  data,
  activeTab,
  roleLabel,
  growthChartData,
  growthAverages,
  hoveredWork,
  visibleMetrics,
  toggleMetric,
  onHoverWork,
  diagnosisContext,
  onClearHover,
}: PersonalCardGrowthProps) {


  return (
    <>
              {/* 2. 近 30 天作品质量增长曲线 */}
              {activeTab === "writers" ? (
                <WriterQualityChart
                  works={data.growthWorks}
                  summary={data.writerQuality?.growthSummary ?? null}
                  rules={data.writerQuality?.rules}
                  state={data.writerQuality?.state ?? "ready"}
                  isQualityReady={Boolean(data.writerQuality)}
                />
              ) : (
                <Card className="p-4 gap-2">
                  <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-normal text-[#1F1E1D] shrink-0">
                      近 30 天作品质量增长曲线
                    </span>
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] shrink-0">
                      {roleLabel} · {growthChartData.length}篇
                    </span>
                  </div>
                  {growthChartData.length > 0 && (
                    /* 胶囊淡底与描边必须与下方折线同色；Tailwind 的任意值类要留字面量才能被编译，
                       取值与 CHART_COLORS.primary / secondary / success 一一对应，改色板时同步这里。 */
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleMetric("interaction")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.interaction
                            ? "bg-[#D97757]/10 border-[#D97757]/30 text-[#D97757]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换互动率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.interaction ? CHART_COLORS.primary : "#A8A29E",
                          }}
                        />
                        <span>互动率</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMetric("like")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.like
                            ? "bg-[#4F5E96]/10 border-[#4F5E96]/30 text-[#4F5E96]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换点赞率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.like ? CHART_COLORS.secondary : "#A8A29E",
                          }}
                        />
                        <span>点赞率</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMetric("favorite")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.favorite
                            ? "bg-[#6FAA7D]/10 border-[#6FAA7D]/30 text-[#6FAA7D]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换收藏率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.favorite ? CHART_COLORS.success : "#A8A29E",
                          }}
                        />
                        <span>收藏率</span>
                      </button>
                    </div>
                  )}
                </div>

                {growthChartData.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#78716C]">
                    近 30 天暂无该岗位作品记录
                  </div>
                ) : (
                  <div
                    className="flex flex-col gap-1 mt-0.5"
                    onMouseLeave={onClearHover}
                  >
                    {/* 顶部跟随行情带：无框通透即时字幕流（固定单行高度，杜绝换行跳动） */}
                    <div
                      className={`px-0.5 h-8 flex items-center justify-between gap-3 text-[12px] border-b border-[#E2E2DF]/50 ${
                        hoveredWork?.reportId ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (hoveredWork?.reportId && diagnosisContext) {
                          void diagnosisContext.openDiagnosisByReportId(hoveredWork.reportId);
                        }
                      }}
                      title={hoveredWork?.reportId ? "点击打开作品复盘诊断" : undefined}
                    >
                      {hoveredWork ? (
                        <div className="flex items-center justify-between w-full gap-3 min-w-0">
                          {/* 作品信息：日期与完整标题 */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium text-[#78716C] shrink-0 tabular-nums">
                              {hoveredWork.reportDate.slice(5)}
                            </span>
                            <span
                              className="text-[#1F1E1D] font-normal truncate"
                              title={
                                hoveredWork.accountName
                                  ? `${hoveredWork.title || "未命名作品"} (@${hoveredWork.accountName})`
                                  : hoveredWork.title || "未命名作品"
                              }
                            >
                              {hoveredWork.title || "未命名作品"}
                            </span>
                          </div>

                          {/* 数据表现 */}
                          <div className="flex items-center gap-2.5 shrink-0 tabular-nums whitespace-nowrap">
                            <span className="text-[#78716C]">
                              播 <span className="font-medium text-[#1F1E1D]">{formatBigNumber(hoveredWork.playCount)}</span>
                            </span>
                            {hoveredWork.hasSnapshot ? (
                              <>
                                {visibleMetrics.interaction && (
                                  <span className="text-[#78716C]">
                                    互动{" "}
                                    <span className="font-medium text-[#D97757]">
                                      {hoveredWork.interactionRate != null ? `${hoveredWork.interactionRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                                {visibleMetrics.like && (
                                  <span className="text-[#78716C]">
                                    点赞{" "}
                                    <span className="font-medium text-[#4F5E96]">
                                      {hoveredWork.likeRate != null ? `${hoveredWork.likeRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                                {visibleMetrics.favorite && (
                                  <span className="text-[#78716C]">
                                    收藏{" "}
                                    <span className="font-medium text-[#6FAA7D]">
                                      {hoveredWork.favoriteRate != null ? `${hoveredWork.favoriteRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
                                数据待采集（未满 24 小时）
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center w-full min-w-0">
                          {/* 30天均值基线：单行展示，杜绝换行跳动 */}
                          <div className="flex items-center gap-2.5 min-w-0 whitespace-nowrap">
                            <span className="text-[#D97757] font-serif select-none text-[13px]">✦</span>
                            <span
                              className="text-[#78716C] font-normal shrink-0"
                              title="口径与岗位榜单一致：全部作品分子合计 ÷ 播放合计（仅计已同步 24h 快照的作品）"
                            >
                              近30天均值
                            </span>
                            {growthAverages && (
                              <>
                                {growthAverages.avgPlay != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均播 <span className="font-medium text-[#1F1E1D]">{formatBigNumber(growthAverages.avgPlay)}</span>
                                  </span>
                                )}
                                {visibleMetrics.interaction && growthAverages.avgInteraction != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均互动 <span className="font-medium text-[#D97757]">{growthAverages.avgInteraction}%</span>
                                  </span>
                                )}
                                {visibleMetrics.like && growthAverages.avgLike != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均点赞 <span className="font-medium text-[#4F5E96]">{growthAverages.avgLike}%</span>
                                  </span>
                                )}
                                {visibleMetrics.favorite && growthAverages.avgFavorite != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均收藏 <span className="font-medium text-[#6FAA7D]">{growthAverages.avgFavorite}%</span>
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <PersonalCardGrowthChart
                      growthChartData={growthChartData}
                            visibleMetrics={visibleMetrics}
                      onHoverWork={onHoverWork}
                      diagnosisContext={diagnosisContext}
                    />
                </div>
              )}
                </Card>
              )}


    </>
  );
}
