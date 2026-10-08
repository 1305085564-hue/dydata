"use client";

import { Metric } from "@/components/ui/metric";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatBigNumber, formatMomChange } from "./types";
import type { CollaborationRoleTab, PersonDetailData } from "./types";
import { PersonalCardGrowth } from "./personal-card-growth";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";
import type { ChartWorkPoint } from "@/lib/collaboration/domain/person-metrics";

interface PersonalCardMetricsProps {
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

export function PersonalCardMetrics({
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
}: PersonalCardMetricsProps) {


  return (
    <>
              {/* 1. 运营数据 KPI 指标群（仅在有独立运营数据或处于运营 Tab 时展示，避免给非运营人员挂空盒子） */}
              {(data.operatorSummary || activeTab === "operators") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[14px] font-normal text-[#1F1E1D]">本月运营概览</span>
                    {data.operatorSummary?.momChange != null && (
                      <span className="font-normal text-[12px]">
                        {data.operatorSummary.momChange > 0 ? (
                          <span className="text-status-success inline-flex items-center gap-0.5">
                            <TrendingUp className="size-3" />+
                            {formatMomChange(data.operatorSummary.momChange)} 环比
                          </span>
                        ) : data.operatorSummary.momChange < 0 ? (
                          <span className="text-status-danger inline-flex items-center gap-0.5">
                            <TrendingDown className="size-3" />
                            {formatMomChange(data.operatorSummary.momChange)} 环比
                          </span>
                        ) : (
                          <span className="text-[#78716C]">0.0% 环比</span>
                        )}
                      </span>
                    )}
                  </div>

                  {data.operatorSummary ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 px-1 border-b border-[#E2E2DF]/60">
                      <div>
                        <div className="text-[12px] text-[#78716C] mb-1">总播放</div>
                        <Metric
                          value={formatBigNumber(data.operatorSummary.totalPlay)}
                        />
                      </div>
                      <div>
                        <div className="text-[12px] text-[#78716C] mb-1">条均播放</div>
                        <Metric
                          value={formatBigNumber(data.operatorSummary.avgPlay)}
                        />
                      </div>
                      <div>
                        <div className="text-[12px] text-[#78716C] mb-1">导粉量</div>
                        <Metric
                          value={data.operatorSummary.totalFollowerConvert.toLocaleString("zh-CN")}
                        />
                      </div>
                      <div>
                        <div className="text-[12px] text-[#78716C] mb-1">爆款作品</div>
                        <Metric
                          value={data.operatorSummary.hitCount}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 px-1 text-[12px] text-[#78716C]">
                      本月暂无作为独立运营负责的协同作品记录
                    </div>
                  )}
                </div>
              )}

              <PersonalCardGrowth
                data={data}
                activeTab={activeTab}
                roleLabel={roleLabel}
                growthChartData={growthChartData}
                growthAverages={growthAverages}
                hoveredWork={hoveredWork}
                visibleMetrics={visibleMetrics}
                toggleMetric={toggleMetric}
                onHoverWork={onHoverWork}
                diagnosisContext={diagnosisContext}
                onClearHover={onClearHover}
              />
    </>
  );
}
