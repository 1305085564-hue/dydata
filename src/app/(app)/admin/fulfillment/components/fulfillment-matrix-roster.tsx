"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";

import type {
  FulfillmentMemberSummary,
  FulfillmentStatus,
} from "@/types/fulfillment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  isFulfilledFulfillmentStatus,
  isWaivedFulfillmentStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";

export interface FulfillmentAppeal {
  id: string;
  user_id: string;
  account_id?: string | null;
  record_date: string;
  reason: string;
  status: string;
  handler_name?: string | null;
}

interface FulfillmentMatrixRosterProps {
  year: number;
  month: number;
  members: FulfillmentMemberSummary[];
  today: string;
  onCellClick: (member: FulfillmentMemberSummary, date: string) => void;
  onMonthChange: (year: number, month: number) => void;
  appeals?: FulfillmentAppeal[];
  onQuickMarkCell?: (
    userId: string,
    date: string,
    action: ManualFulfillmentMarkStatus,
  ) => Promise<void>;
  onReviewPendingExemption?: (
    requestId: string,
    action: "approved" | "rejected",
  ) => Promise<void>;
}

export interface ActiveCellData {
  member: FulfillmentMemberSummary;
  dateKey: string;
  day: number;
  status: FulfillmentStatus | undefined;
  record?: FulfillmentMemberSummary["days"][string];
  appeal?: FulfillmentAppeal;
  rect: DOMRect;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateKey(year: number, month: number, day: number) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

const TOOLTIP_ESTIMATED_HEIGHT = 220;

export function getTooltipPlacement(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const centerX = Math.min(
    Math.max(138, viewportWidth - 138),
    Math.max(138, rect.left + rect.width / 2),
  );
  const canPlaceAbove = rect.top >= TOOLTIP_ESTIMATED_HEIGHT + 10;

  if (canPlaceAbove) {
    return {
      top: Math.max(10, rect.top - 8),
      left: centerX,
      transform: "translate(-50%, -100%)",
    };
  }

  return {
    top: Math.min(
      Math.max(10, rect.bottom + 8),
      Math.max(10, viewportHeight - TOOLTIP_ESTIMATED_HEIGHT - 10),
    ),
    left: centerX,
    transform: "translate(-50%, 0)",
  };
}

function getStatusColor(
  status: FulfillmentStatus | undefined,
  hasPendingExemption = false,
): string {
  if (hasPendingExemption) return "bg-status-warning/20 border-status-warning/40";
  if (!status) return "border-transparent bg-transparent";
  if (isFulfilledFulfillmentStatus(status)) {
    return "bg-status-success/20 border-status-success/35 text-status-success";
  }
  if (isWaivedFulfillmentStatus(status)) {
    return "bg-status-info/10 border-status-info/25 text-status-info";
  }
  switch (status) {
    case "leave":
      return "bg-status-info/15 border-status-info/30 text-status-info";
    case "absent":
      return "bg-status-danger/15 border-status-danger/35 text-status-danger";
    case "unconfirmed":
      return "bg-[#F1F1F0] border-[#E2E2DF] text-[#78716C]";
    default:
      return "bg-[#FCFCFB] border-[#E2E2DF]/60 text-[#78716C]";
  }
}

function getStatusLabel(status: FulfillmentStatus | undefined): string {
  if (!status) return "无记录";
  const labels: Record<FulfillmentStatus, string> = {
    published: "已发布",
    confirmed_published: "已确认",
    leave: "请假",
    waived: "豁免",
    exempted: "豁免期",
    absent: "缺勤",
    unconfirmed: "待确认",
  };
  return labels[status] ?? status;
}

type SortMode = "rate_asc" | "rate_desc" | "missing_desc" | "default";

export function FulfillmentMatrixRoster({
  year,
  month,
  members,
  today,
  onCellClick,
  onMonthChange,
  appeals = [],
  onQuickMarkCell,
  onReviewPendingExemption,
}: FulfillmentMatrixRosterProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<ActiveCellData | null>(null);
  const [openMenuCell, setOpenMenuCell] = useState<ActiveCellData | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("rate_asc");

  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  // 构建申诉缓存映射
  const appealMap = useMemo(() => {
    const map = new Map<string, FulfillmentAppeal>();
    if (Array.isArray(appeals)) {
      for (const appeal of appeals) {
        map.set(`${appeal.user_id}_${appeal.record_date}`, appeal);
      }
    }
    return map;
  }, [appeals]);

  // 排序逻辑：默认达成率升序（让落后者最优先浮现）
  const sortedMembers = useMemo(() => {
    const list = [...members];
    switch (sortMode) {
      case "rate_asc":
        return list.sort((a, b) => {
          if (a.fulfillmentRate !== b.fulfillmentRate) {
            return a.fulfillmentRate - b.fulfillmentRate;
          }
          return b.remainingCount - a.remainingCount;
        });
      case "rate_desc":
        return list.sort((a, b) => b.fulfillmentRate - a.fulfillmentRate);
      case "missing_desc":
        return list.sort((a, b) => b.consecutiveMissing - a.consecutiveMissing);
      default:
        return list;
    }
  }, [members, sortMode]);

  // 监听滚动与 Escape 自动关闭悬浮弹窗
  useEffect(() => {
    const handleScrollOrKey = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpenMenuCell(null);
        setHoveredCell(null);
      } else if (!(e instanceof KeyboardEvent)) {
        setHoveredCell(null);
      }
    };
    window.addEventListener("scroll", handleScrollOrKey, true);
    window.addEventListener("keydown", handleScrollOrKey);
    return () => {
      window.removeEventListener("scroll", handleScrollOrKey, true);
      window.removeEventListener("keydown", handleScrollOrKey);
    };
  }, []);

  const handlePrevMonth = () => {
    setOpenMenuCell(null);
    setHoveredCell(null);
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    setOpenMenuCell(null);
    setHoveredCell(null);
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const handleCurrentMonth = () => {
    setOpenMenuCell(null);
    setHoveredCell(null);
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth() + 1);
  };

  const isCurrentMonth = () => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  };

  const activeCell = openMenuCell || hoveredCell;
  const tooltipPosition =
    activeCell && typeof window !== "undefined"
      ? getTooltipPlacement(
          activeCell.rect,
          window.innerWidth,
          window.innerHeight,
        )
      : undefined;

  return (
    <div className="space-y-3">
      {/* 矩阵标题、排序器与月度切换栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF]/60 pb-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="monthly-matrix-panel"
          onClick={() => setExpanded((current) => !current)}
          className="flex items-center gap-2 text-left rounded-md transition-colors cursor-pointer group"
        >
          <SectionHeading as="h3" className="group-hover:text-[#D97757] transition-colors">
            全员发布战况主表
          </SectionHeading>
          <span className="text-[12px] font-normal text-[#78716C]">
            {year}年{month}月 · {members.length} 位成员
          </span>
          {expanded ? (
            <ChevronUp className="size-4 text-[#78716C] group-hover:text-[#1F1E1D] transition-transform" />
          ) : (
            <ChevronDown className="size-4 text-[#78716C] group-hover:text-[#1F1E1D] transition-transform" />
          )}
        </button>

        {expanded && (
          <div className="flex shrink-0 items-center gap-2">
            {/* 快速排序下拉/切换（遵循 Claude 哲学：浅砂底座 + 浮起纯白激活触点） */}
            <div className="inline-flex items-center gap-1 rounded-md border border-[#E2E2DF]/60 bg-[#F1F1F0] p-0.5 text-[12px] shadow-input">
              <span className="px-2 text-[#78716C] flex items-center gap-1">
                <ArrowUpDown className="size-3 text-[#78716C]" />
                排序:
              </span>
              <button
                type="button"
                onClick={() => setSortMode("rate_asc")}
                className={`rounded-md px-2.5 py-1 text-[12px] transition-all cursor-pointer ${
                  sortMode === "rate_asc"
                    ? "bg-white text-[#141413] shadow-input font-medium"
                    : "text-[#78716C] hover:text-[#141413] hover:bg-white/50"
                }`}
              >
                落后优先
              </button>
              <button
                type="button"
                onClick={() => setSortMode("rate_desc")}
                className={`rounded-md px-2.5 py-1 text-[12px] transition-all cursor-pointer ${
                  sortMode === "rate_desc"
                    ? "bg-white text-[#141413] shadow-input font-medium"
                    : "text-[#78716C] hover:text-[#141413] hover:bg-white/50"
                }`}
              >
                高达成优先
              </button>
              <button
                type="button"
                onClick={() => setSortMode("missing_desc")}
                className={`rounded-md px-2.5 py-1 text-[12px] transition-all cursor-pointer ${
                  sortMode === "missing_desc"
                    ? "bg-white text-[#141413] shadow-input font-medium"
                    : "text-[#78716C] hover:text-[#141413] hover:bg-white/50"
                }`}
              >
                断更优先
              </button>
            </div>

            {/* 月份切换器 */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="上一月"
                className="h-7 w-7 text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] rounded-md"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-[68px] text-center text-[12px] font-normal tabular-nums text-[#1F1E1D]">
                {year}年{month}月
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="下一月"
                className="h-7 w-7 text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] rounded-md"
                onClick={handleNextMonth}
              >
                <ChevronRight className="size-3.5" />
              </Button>
              {!isCurrentMonth() && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCurrentMonth}
                  className="ml-1 text-[12px] h-6 px-2 text-[#D97757] hover:bg-[#D97757]/10 rounded-md"
                >
                  回到当月
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 展开的表格大盘 */}
      {expanded && (
        <div id="monthly-matrix-panel" className="space-y-3">
          <Card className="overflow-x-auto p-0 gap-0 shadow-card-ring border-[#E2E2DF]/60">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E2E2DF]/60 bg-[#FAF9F7]/90 text-[12px]">
                  {/* 左侧第一列：成员身份（紧凑 6 成留白，姓名部门舒展不折行） */}
                  <th className="sticky left-0 z-20 w-[104px] min-w-[104px] max-w-[104px] border-r border-[#E2E2DF]/60 bg-[#FAF9F7]/95 backdrop-blur-md px-3 py-3 text-left font-normal uppercase tracking-wider text-[#78716C]">
                    成员
                  </th>

                  {/* 左侧第二列：实发 / 应发、状态徽章与考核天数算式 */}
                  <th className="sticky left-[104px] z-20 w-[240px] min-w-[240px] max-w-[240px] border-r border-[#E2E2DF]/60 bg-[#FAF9F7]/95 backdrop-blur-md px-3.5 py-3 text-left font-normal uppercase tracking-wider text-[#78716C]">
                    实发 / 应发 · 算式
                  </th>

                  {/* 中间 1~31 天表头（首日增起跑留白②，末日增收尾留白③） */}
                  {dayNumbers.map((day) => {
                    const dateKey = formatDateKey(year, month, day);
                    const isToday = dateKey === today;
                    const isColHovered = day === (hoveredCell?.day ?? openMenuCell?.day);
                    const isFirstDay = day === 1;
                    const isLastDay = day === dayNumbers[dayNumbers.length - 1];

                    return (
                      <th
                        key={day}
                        className={`min-w-[26px] py-2.5 text-center text-[12px] tabular-nums transition-colors duration-150 ${
                          isFirstDay ? "pl-2.5 pr-0.5" : isLastDay ? "pl-0.5 pr-2.5" : "px-0.5"
                        } ${
                          isColHovered
                            ? "text-[#D97757] font-normal bg-[#F1F1F0]"
                            : isToday
                              ? "text-[#D97757] font-medium"
                              : "text-[#78716C] font-normal"
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span>{day}</span>
                          {isToday && (
                            <span className="size-1 rounded-full bg-current text-[#D97757] mt-0.5" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {sortedMembers.map((member) => {
                  const isRowHovered =
                    member.userId === (hoveredCell?.member.userId ?? openMenuCell?.member.userId);

                  // 考核天数精准算式：考核天数 = 应发 + 请假 + 豁免
                  const assessedDays = member.requiredCount + member.leaveDays + member.waivedDays;

                  // 梯队标签分级
                  const tier =
                    member.requiredCount === 0 || member.publishedCount >= member.requiredCount
                      ? { label: "达标", color: "bg-status-success/10 text-status-success border-status-success/20" }
                      : member.fulfillmentRate >= 80
                        ? { label: "冲刺", color: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/20" }
                        : member.fulfillmentRate >= 60
                          ? { label: "预警", color: "bg-status-warning/15 text-status-warning border-status-warning/30" }
                          : { label: "断更", color: "bg-status-danger/10 text-status-danger border-status-danger/20" };

                  return (
                    <tr
                      key={member.userId}
                      className={`border-b border-[#E2E2DF]/60 last:border-b-0 transition-colors duration-100 ${
                        isRowHovered ? "bg-[#F7F7F6]" : "hover:bg-[#F7F7F6]/60"
                      }`}
                    >
                      {/* 左侧第一列：成员身份（紧凑 6 成留白，姓名部门舒展不折行） */}
                      <td
                        className={`sticky left-0 z-10 w-[104px] min-w-[104px] max-w-[104px] border-r border-[#E2E2DF]/60 px-3 py-2.5 transition-colors ${
                          isRowHovered
                            ? "bg-[#FCFCFB] text-[#D97757]"
                            : "bg-white/95 backdrop-blur-sm"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onCellClick(member, today)}
                          className="flex flex-col items-start text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 cursor-pointer group/name w-full overflow-hidden"
                        >
                          <span
                            className={`text-[13px] font-normal transition-colors group-hover/name:text-[#D97757] truncate w-full whitespace-nowrap ${
                              isRowHovered ? "text-[#D97757]" : "text-[#141413]"
                            }`}
                          >
                            {member.userName}
                          </span>
                          {member.teamName && (
                            <span className="text-[12px] text-[#78716C] font-normal truncate w-full whitespace-nowrap mt-0.5">
                              {member.teamName}
                            </span>
                          )}
                        </button>
                      </td>

                      {/* 左侧第二列：实发 / 应发、状态徽章与考核天数算式 */}
                      <td
                        className={`sticky left-[104px] z-10 w-[240px] min-w-[240px] max-w-[240px] border-r border-[#E2E2DF]/60 px-3.5 py-2.5 transition-colors ${
                          isRowHovered
                            ? "bg-[#FCFCFB]"
                            : "bg-white/95 backdrop-blur-sm"
                        }`}
                      >
                        <div className="flex flex-col items-start gap-1 w-full">
                          {/* 顶行：实发 / 应发数值与达标、断更徽章两端对齐展示 */}
                          <div className="flex items-center justify-between gap-1 w-full">
                            <div className="flex items-baseline gap-1 text-[13px] tabular-nums shrink-0">
                              <span
                                className={`font-medium ${
                                  member.requiredCount > 0 &&
                                  member.publishedCount >= member.requiredCount
                                    ? "text-status-success"
                                    : member.fulfillmentRate >= 60
                                      ? "text-[#141413]"
                                      : "text-status-danger"
                                }`}
                              >
                                {member.publishedCount}
                              </span>
                              <span className="text-[12px] text-[#A8A29E]">/</span>
                              <span className="text-[12px] text-[#78716C] font-normal">
                                {member.requiredCount} 条应发
                              </span>
                            </div>

                            {/* 状态徽章紧随其后 */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal border tabular-nums ${tier.color}`}
                              >
                                {tier.label} {member.fulfillmentRate}%
                              </span>
                              {member.consecutiveMissing >= 2 && (
                                <span className="rounded-md bg-status-danger/10 px-1.5 py-0.5 text-[12px] text-status-danger tabular-nums">
                                  断{member.consecutiveMissing}天
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 中行：饱满的进度条（横向延展，消除右侧空洞） */}
                          <div className="h-1 w-full overflow-hidden rounded-full bg-[#F1F1F0]">
                            <div
                              className={`h-full rounded-full transition-all duration-200 ${
                                member.fulfillmentRate >= 100
                                  ? "bg-status-success"
                                  : member.fulfillmentRate >= 80
                                    ? "bg-[#D97757]"
                                    : member.fulfillmentRate >= 60
                                      ? "bg-status-warning"
                                      : "bg-status-danger"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, member.fulfillmentRate))}%` }}
                            />
                          </div>

                          {/* 底行：严谨透明的考核天数算式 */}
                          <div className="text-[12px] text-[#78716C] font-normal tabular-nums leading-tight">
                            {member.leaveDays > 0 || member.waivedDays > 0 ? (
                              <span>
                                考核{assessedDays}
                                {member.leaveDays > 0 && ` - 假${member.leaveDays}`}
                                {member.waivedDays > 0 && ` - 免${member.waivedDays}`}
                                {" = "}{member.requiredCount}
                              </span>
                            ) : (
                              <span className="text-[#78716C]">
                                考核{assessedDays}天全勤
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 1~31 天网格小格子（首日增起跑留白②，末日增收尾留白③，间距缩30%，方块轻微扩大至22px） */}
                      {dayNumbers.map((day) => {
                        const dateKey = formatDateKey(year, month, day);
                        const record = member.days[dateKey];
                        const status = record?.status;
                        const isToday = dateKey === today;
                        const isColHovered = day === (hoveredCell?.day ?? openMenuCell?.day);
                        const appeal = appealMap.get(`${member.userId}_${dateKey}`);
                        const isFirstDay = day === 1;
                        const isLastDay = day === dayNumbers[dayNumbers.length - 1];

                        return (
                          <td
                            key={day}
                            className={`py-1.5 transition-colors duration-100 ${
                              isFirstDay ? "pl-2.5 pr-0.5" : isLastDay ? "pl-0.5 pr-2.5" : "px-0.5"
                            } ${
                              isColHovered || isRowHovered ? "bg-[#FCFCFB]" : ""
                            }`}
                          >
                            <button
                              type="button"
                              data-date={dateKey}
                              aria-label={`查看 ${member.userName} ${month}月${day}日发布状态`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setOpenMenuCell({
                                  member,
                                  dateKey,
                                  day,
                                  status,
                                  record,
                                  appeal,
                                  rect,
                                });
                                setHoveredCell(null);
                              }}
                              onMouseEnter={(e) => {
                                if (openMenuCell) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredCell({
                                  member,
                                  dateKey,
                                  day,
                                  status,
                                  record,
                                  appeal,
                                  rect,
                                });
                              }}
                              onMouseLeave={() => {
                                setHoveredCell(null);
                              }}
                              className={`mx-auto flex size-[22px] items-center justify-center rounded-md border transition-all duration-150 hover:border-[#78716C]/40 hover:brightness-95 hover:z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 ${getStatusColor(
                                status,
                                Boolean(record?.pendingExemption),
                              )} ${
                                isToday
                                  ? "ring-1.5 ring-[#D97757] ring-offset-1 z-10"
                                  : ""
                              } ${
                                appeal
                                  ? "ring-1.5 ring-status-warning ring-offset-1"
                                  : ""
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* 底部轻量图例说明 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-[#F1F1F0]/80 border border-[#E2E2DF]/60 px-3.5 py-2 text-[12px] text-[#78716C]">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-status-success/20 border border-status-success/40" />
              已发布 / 确认
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-status-info/20 border border-status-info/35" />
              请假
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-status-info/10 border border-status-info/20" />
              豁免期
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-status-danger/15 border border-status-danger/35" />
              缺勤
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-status-warning/10 border border-status-warning/30" />
              待审批请假
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-md bg-[#F1F1F0] border border-[#E2E2DF]/60" />
              待确认
            </span>
            <span className="ml-auto text-[12px] text-[#A8A29E]">
              提示：点击表格内任意方格可快速改判或审批请假
            </span>
          </div>
        </div>
      )}

      {/* 悬停微卡片 Tooltip */}
      {hoveredCell && tooltipPosition && !openMenuCell && (
        <div
          style={{
            position: "fixed",
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: tooltipPosition.transform,
            zIndex: 50,
          }}
          className="pointer-events-none w-64 rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-claude-float"
        >
          <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-1.5">
            <span className="text-[12px] font-normal text-[#141413]">
              {hoveredCell.member.userName} · {hoveredCell.dateKey}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[12px] font-normal ${getStatusColor(
                hoveredCell.status,
              )}`}
            >
              {getStatusLabel(hoveredCell.status)}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-[12px] text-[#78716C]">
            <p>
              实发作品：
              <span className="font-normal text-[#141413] tabular-nums">
                {hoveredCell.record?.publishedCount || 0}
              </span>{" "}
              条
            </p>
            {hoveredCell.record?.reason && (
              <p className="text-[12px] text-[#A8A29E]">
                备注：{hoveredCell.record.reason}
              </p>
            )}
            {hoveredCell.appeal && (
              <p className="rounded-md bg-status-warning/10 p-1 text-[12px] text-status-warning">
                申诉：{hoveredCell.appeal.reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 点击弹出的单日改判快捷菜单（保持既有写流程完整） */}
      {openMenuCell && tooltipPosition && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenuCell(null)}
          />
          <div
            style={{
              position: "fixed",
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              transform: tooltipPosition.transform,
              zIndex: 50,
            }}
            className="w-72 rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-claude-float max-h-[calc(100dvh-1rem)] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-2">
              <div>
                <p className="text-[13px] font-normal text-[#141413]">
                  {openMenuCell.member.userName}
                </p>
                <p className="text-[12px] text-[#78716C]">
                  {openMenuCell.dateKey}
                </p>
              </div>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[12px] font-normal ${getStatusColor(
                  openMenuCell.status,
                )}`}
              >
                {getStatusLabel(openMenuCell.status)}
              </span>
            </div>

            {/* 待审批请假操作 */}
            {openMenuCell.record?.pendingExemption && onReviewPendingExemption && (
              <div className="mt-2.5 rounded-md border border-status-warning/20 bg-status-warning/5 p-2 space-y-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-status-warning font-normal">
                    请假申请待批
                  </span>
                  <span className="text-[#A8A29E]">
                    {openMenuCell.record.pendingExemption.exemption_type === "leave"
                      ? "请假"
                      : "免交"}
                  </span>
                </div>
                {openMenuCell.record.pendingExemption.reason && (
                  <p className="text-[12px] text-[#78716C]">
                    事由：{openMenuCell.record.pendingExemption.reason}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={Boolean(reviewingRequestId)}
                    className="text-[12px] h-6 px-2 text-status-success hover:bg-status-success/10 font-normal"
                    onClick={async () => {
                      const reqId = openMenuCell.record?.pendingExemption?.id;
                      if (!reqId) return;
                      setReviewingRequestId(reqId);
                      try {
                        await onReviewPendingExemption(reqId, "approved");
                        setOpenMenuCell(null);
                      } finally {
                        setReviewingRequestId(null);
                      }
                    }}
                  >
                    批准
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={Boolean(reviewingRequestId)}
                    className="text-[12px] h-6 px-2 text-status-danger hover:bg-status-danger/10 font-normal"
                    onClick={async () => {
                      const reqId = openMenuCell.record?.pendingExemption?.id;
                      if (!reqId) return;
                      setReviewingRequestId(reqId);
                      try {
                        await onReviewPendingExemption(reqId, "rejected");
                        setOpenMenuCell(null);
                      } finally {
                        setReviewingRequestId(null);
                      }
                    }}
                  >
                    驳回
                  </Button>
                </div>
              </div>
            )}

            {/* 改判状态动作列表 */}
            {onQuickMarkCell && (
              <div className="mt-2.5 space-y-1">
                <p className="text-[12px] text-[#78716C] px-1">快捷改判此日：</p>
                <div className="grid grid-cols-2 gap-1 text-[12px]">
                  <button
                    type="button"
                    onClick={async () => {
                      await onQuickMarkCell(
                        openMenuCell.member.userId,
                        openMenuCell.dateKey,
                        "confirmed_published",
                      );
                      setOpenMenuCell(null);
                    }}
                    className="flex items-center justify-center rounded-md border border-[#E2E2DF]/60 bg-white py-1.5 hover:bg-status-success/10 hover:text-status-success text-[#1F1E1D] transition-colors"
                  >
                    标为已发
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onQuickMarkCell(
                        openMenuCell.member.userId,
                        openMenuCell.dateKey,
                        "leave",
                      );
                      setOpenMenuCell(null);
                    }}
                    className="flex items-center justify-center rounded-md border border-[#E2E2DF]/60 bg-white py-1.5 hover:bg-status-info/10 hover:text-status-info text-[#1F1E1D] transition-colors"
                  >
                    标为请假
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onQuickMarkCell(
                        openMenuCell.member.userId,
                        openMenuCell.dateKey,
                        "waived",
                      );
                      setOpenMenuCell(null);
                    }}
                    className="flex items-center justify-center rounded-md border border-[#E2E2DF]/60 bg-white py-1.5 hover:bg-status-info/10 hover:text-status-info text-[#1F1E1D] transition-colors"
                  >
                    标为豁免
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onQuickMarkCell(
                        openMenuCell.member.userId,
                        openMenuCell.dateKey,
                        "absent",
                      );
                      setOpenMenuCell(null);
                    }}
                    className="flex items-center justify-center rounded-md border border-[#E2E2DF]/60 bg-white py-1.5 hover:bg-status-danger/10 hover:text-status-danger text-[#1F1E1D] transition-colors"
                  >
                    标为缺勤
                  </button>
                </div>
              </div>
            )}

            {/* 查看当月详情 */}
            <div className="mt-3 border-t border-[#E2E2DF]/60 pt-2 flex justify-between items-center text-[12px]">
              <button
                type="button"
                onClick={() => {
                  const m = openMenuCell.member;
                  const d = openMenuCell.dateKey;
                  setOpenMenuCell(null);
                  onCellClick(m, d);
                }}
                className="text-[#D97757] hover:underline font-normal text-[12px]"
              >
                查看该成员完整月历档案 →
              </button>
              <button
                type="button"
                onClick={() => setOpenMenuCell(null)}
                className="text-[#78716C] hover:text-[#141413] text-[12px]"
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
