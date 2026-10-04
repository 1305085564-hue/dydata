"use client";

import { useEffect } from "react";
import type { DotItemDotProps, ActiveDotProps } from "recharts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_GRID_PROPS, CHART_AXIS_TICK } from "@/lib/chart-palette";
import type { ChartWorkPoint } from "@/lib/collaboration/domain/person-metrics";
import { resolveChartPoint } from "@/lib/collaboration/domain/person-metrics";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";

interface GrowthTooltipBridgeProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartWorkPoint }>;
  onHover?: (point: ChartWorkPoint) => void;
}

function GrowthTooltipBridge({ active, payload, onHover }: GrowthTooltipBridgeProps) {
  useEffect(() => {
    if (active && payload && payload.length > 0 && payload[0]?.payload) {
      onHover?.(payload[0].payload);
    }
  }, [active, payload, onHover]);

  return null;
}

interface PersonalCardGrowthChartProps {
  growthChartData: ChartWorkPoint[];
  visibleMetrics: { interaction: boolean; like: boolean; favorite: boolean };
  onHoverWork: (point: ChartWorkPoint) => void;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}

export function PersonalCardGrowthChart({
  growthChartData,
  visibleMetrics,
  onHoverWork,
  diagnosisContext,
}: PersonalCardGrowthChartProps) {
  const renderPendingDot = (props: DotItemDotProps | ActiveDotProps, active: boolean) => {
    const point = props.payload as ChartWorkPoint | undefined;
    if (!point || point.hasSnapshot) return null;
    const { cx, cy } = props;
    const ink = active ? CHART_COLORS.muted : CHART_COLORS.pending;
    return (
      <g
        key={`pending-${active ? "act" : "dot"}-${point.reportId}`}
        className="cursor-pointer"
        onMouseEnter={() => onHoverWork(point)}
        onClick={() => {
          if (diagnosisContext) {
            void diagnosisContext.openDiagnosisByReportId(point.reportId);
          }
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={active ? 6 : 4}
          fill={CHART_COLORS.surface}
          stroke={ink}
          strokeWidth={active ? 2 : 1.5}
          strokeDasharray={active ? undefined : "2 2"}
        />
        <circle cx={cx} cy={cy} r={active ? 2 : 1.5} fill={ink} />
      </g>
    );
  };

  return (
    <>
                    <div className="h-48 w-full mt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={growthChartData}
                          margin={{ top: 12, right: 12, left: -20, bottom: 4 }}
                          onMouseMove={(state) => {
                            const point = resolveChartPoint(state, growthChartData);
                            if (point) {
                              onHoverWork(point);
                            }
                          }}
                          onClick={(state) => {
                            const point = resolveChartPoint(state, growthChartData);
                            if (point?.reportId && diagnosisContext) {
                              void diagnosisContext.openDiagnosisByReportId(point.reportId);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <CartesianGrid {...CHART_GRID_PROPS} />
                          <XAxis
                            dataKey="reportId"
                            tick={CHART_AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(reportId: string) => {
                              const item = growthChartData.find((w) => w.reportId === reportId);
                              return item ? item.reportDate.slice(5) : "";
                            }}
                            interval="preserveStartEnd"
                            minTickGap={20}
                          />
                          <YAxis
                            tick={CHART_AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            domain={growthChartData.some((w) => w.hasSnapshot) ? [0, "auto"] : [0, 5]}
                            tickFormatter={(v: number) => `${v}%`}
                            allowDecimals={true}
                          />
                          <RechartsTooltip
                            cursor={{
                              stroke: CHART_COLORS.primary,
                              strokeWidth: 1,
                              strokeDasharray: "2 2",
                              strokeOpacity: 0.6,
                            }}
                            content={<GrowthTooltipBridge onHover={onHoverWork} />}
                            wrapperStyle={{ display: "none" }}
                          />
                        {visibleMetrics.interaction && (
                          <Line
                            type="monotone"
                            dataKey="interactionRate"
                            name="互动率"
                            stroke={CHART_COLORS.primary}
                            strokeWidth={2}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.primary,
                              strokeWidth: 2,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.primary,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
                        {visibleMetrics.like && (
                          <Line
                            type="monotone"
                            dataKey="likeRate"
                            name="点赞率"
                            stroke={CHART_COLORS.secondary}
                            strokeWidth={1.5}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.secondary,
                              strokeWidth: 1.5,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.secondary,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
                        {visibleMetrics.favorite && (
                          <Line
                            type="monotone"
                            dataKey="favoriteRate"
                            name="收藏率"
                            stroke={CHART_COLORS.success}
                            strokeWidth={1.5}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.success,
                              strokeWidth: 1.5,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.success,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="pendingPoint"
                          name="待采集"
                          stroke="none"
                          connectNulls={false}
                          isAnimationActive={false}
                          legendType="none"
                          dot={(props) => renderPendingDot(props, false)}
                          activeDot={(props) => renderPendingDot(props, true)}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
    </>
  );
}
