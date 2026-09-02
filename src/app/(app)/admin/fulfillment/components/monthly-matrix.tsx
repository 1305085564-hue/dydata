"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import type {
  FulfillmentMemberSummary,
  FulfillmentStatus,
} from "@/types/fulfillment";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FulfillmentAppeal {
  id: string;
  user_id: string;
  record_date: string;
  reason: string;
  status: string;
  handler_name?: string | null;
}

interface MonthlyMatrixProps {
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
    action: "confirmed_published" | "leave" | "waived" | "absent",
  ) => Promise<void>;
  onReviewPendingExemption?: (
    requestId: string,
    action: "approved" | "rejected",
  ) => Promise<void>;
}

interface ActiveCellData {
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

function getTooltipPlacement(
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
  if (hasPendingExemption) return "bg-[#B98A54]/15 border-[#B98A54]/30";
  if (!status) return "border-transparent bg-transparent";
  switch (status) {
    case "published":
    case "confirmed_published":
      return "bg-[#6FAA7D]/25 border-[#6FAA7D]/40";
    case "leave":
      return "bg-[#43718E]/20 border-[#43718E]/30";
    case "waived":
    case "exempted":
      return "bg-[#43718E]/10 border-[#43718E]/20";
    case "absent":
      return "bg-[#C0685C]/15 border-[#C0685C]/30";
    case "unconfirmed":
      return "bg-[#F5F3EE] border-[#ECE7DE]";
    default:
      return "bg-[#FBF9F5] border-[#ECE7DE]";
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

export function MonthlyMatrix({
  year,
  month,
  members,
  today,
  onCellClick,
  onMonthChange,
  appeals = [],
  onQuickMarkCell,
  onReviewPendingExemption,
}: MonthlyMatrixProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<ActiveCellData | null>(null);
  const [openMenuCell, setOpenMenuCell] = useState<ActiveCellData | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

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

  const tooltipPosition =
    hoveredCell && typeof window !== "undefined"
      ? getTooltipPlacement(
          hoveredCell.rect,
          window.innerWidth,
          window.innerHeight,
        )
      : undefined;

  return (
    <div className="space-y-3">
      {/* 矩阵标题与月度切换器（去框出版物排版） */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E0D6]/50 pb-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="monthly-matrix-panel"
          onClick={() => setExpanded((current) => !current)}
          className="flex items-center gap-2.5 text-left rounded-lg transition-colors cursor-pointer group"
        >
          <span className="text-base font-semibold text-[#1C1917] group-hover:text-[#D97757] transition-colors">
            月度履约热力矩阵
          </span>
          <span className="text-[12px] font-normal text-[#78716C]">
            {year}年{month}月 · {members.length} 位成员
          </span>
          {expanded ? (
            <ChevronUp className="size-4 text-[#78716C] group-hover:text-[#292524] transition-transform" />
          ) : (
            <ChevronDown className="size-4 text-[#78716C] group-hover:text-[#292524] transition-transform" />
          )}
        </button>

        {expanded && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="上一月"
              className="h-7 w-7 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] rounded-lg"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-[68px] text-center text-[12px] font-medium tabular-nums text-[#292524]">
              {year}年{month}月
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="下一月"
              className="h-7 w-7 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] rounded-lg"
              onClick={handleNextMonth}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            {!isCurrentMonth() && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleCurrentMonth}
                className="ml-1 text-[11px] h-6 px-2 text-[#D97757] hover:bg-[#D97757]/10 rounded-md"
              >
                回到当月
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div id="monthly-matrix-panel" className="space-y-3">
          <div className="overflow-x-auto rounded-xl bg-white shadow-card-ring">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#ECE7DE]/80 bg-transparent">
                  <th className="sticky left-0 z-10 min-w-[120px] border-r border-[#ECE7DE]/60 bg-[#FBF9F5]/90 backdrop-blur-md px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                    成员
                  </th>
                  {dayNumbers.map((day) => {
                    const dateKey = formatDateKey(year, month, day);
                    const isToday = dateKey === today;
                    const isColHovered = day === (hoveredCell?.day ?? openMenuCell?.day);
                    return (
                      <th
                        key={day}
                        className={`min-w-[26px] px-0.5 py-2.5 text-center text-[12px] tabular-nums transition-colors duration-150 ${
                          isColHovered
                            ? "text-[#D97757] font-semibold bg-[#F5F3EE]"
                            : isToday
                              ? "text-[#D97757] font-semibold"
                              : "text-[#78716C] font-normal"
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span>{day}</span>
                          {isToday && (
                            <span className="size-1 rounded-full bg-[#D97757] mt-0.5" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 min-w-[76px] border-l border-[#ECE7DE]/60 bg-[#FBF9F5]/90 backdrop-blur-md px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                    实发 / 应发
                  </th>
                </tr>
              </thead>

              <tbody>
                {members.map((member) => {
                  const isRowHovered = member.userId === (hoveredCell?.member.userId ?? openMenuCell?.member.userId);
                  return (
                    <tr
                      key={member.userId}
                      className={`border-b border-[#ECE7DE]/60 last:border-b-0 transition-colors duration-100 ${
                        isRowHovered ? "bg-[#FAF8F4]" : "hover:bg-[#FAF8F4]/50"
                      }`}
                    >
                      <td
                        className={`sticky left-0 z-10 border-r border-[#ECE7DE]/60 px-3 py-1.5 shadow-[2px_0_5px_rgba(0,0,0,0.01)] transition-colors ${
                          isRowHovered
                            ? "bg-[#FAF8F4] text-[#D97757]"
                            : "bg-white/95 backdrop-blur-sm"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onCellClick(member, today)}
                          className="flex items-center gap-1.5 whitespace-nowrap text-left rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/40 cursor-pointer"
                        >
                          <span
                            className={`text-[13px] font-medium transition-colors ${
                              isRowHovered ? "text-[#D97757]" : "text-[#1C1917]"
                            }`}
                          >
                            {member.userName}
                          </span>
                          {member.teamName && (
                            <span className="text-[11px] text-[#A8A29E] font-normal">
                              {member.teamName}
                            </span>
                          )}
                        </button>
                      </td>
                      {dayNumbers.map((day) => {
                        const dateKey = formatDateKey(year, month, day);
                        const record = member.days[dateKey];
                        const status = record?.status;
                        const isToday = dateKey === today;
                        const isColHovered = day === (hoveredCell?.day ?? openMenuCell?.day);
                        const appeal = appealMap.get(
                          `${member.userId}_${dateKey}`,
                        );

                        return (
                          <td
                            key={day}
                            className={`px-0.5 py-1 transition-colors duration-100 ${
                              isColHovered || isRowHovered
                                ? "bg-[#FAF8F4]"
                                : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
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
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
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
                              className={`mx-auto flex size-[17px] items-center justify-center rounded-[3px] border transition-all duration-150 hover:border-[#78716C]/40 hover:brightness-95 hover:z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/40 ${getStatusColor(
                                status,
                                Boolean(record?.pendingExemption),
                              )} ${
                                isToday
                                  ? "ring-1.5 ring-[#D97757] ring-offset-1 z-10"
                                  : ""
                              } ${
                                appeal
                                  ? "ring-1.5 ring-[#B98A54] ring-offset-1"
                                  : ""
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border-l border-[#ECE7DE]/60 bg-[#FBF9F5]/90 backdrop-blur-md px-3 py-1.5 text-right shadow-[-2px_0_5px_rgba(0,0,0,0.01)]">
                        <span
                          className={`text-[12px] tabular-nums font-medium ${
                            member.requiredCount > 0 && member.publishedCount >= member.requiredCount
                              ? "text-[#6FAA7D]"
                              : member.requiredCount > 0 && member.publishedCount / member.requiredCount >= 0.6
                                ? "text-[#1C1917]"
                                : "text-[#C0685C]"
                          }`}
                        >
                          {member.publishedCount}
                        </span>
                        <span className="mx-1 text-[11px] text-[#A8A29E] font-normal">
                          /
                        </span>
                        <span className="text-[12px] tabular-nums text-[#78716C] font-normal">
                          {member.requiredCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 图例（轻量微气垫条） */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-[#F5F3EE]/80 border border-[#ECE7DE]/80 px-3.5 py-2 text-[12px] text-[#78716C]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#6FAA7D]/20 border border-[#6FAA7D]/40" />
              已发布 / 确认
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#43718E]/20 border border-[#43718E]/35" />
              请假
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#43718E]/10 border border-[#43718E]/20" />
              豁免期
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#C0685C]/15 border border-[#C0685C]/35" />
              缺勤
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#B98A54]/10 border border-[#B98A54]/30" />
              待审批请假
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-[#F5F3EE] border border-[#E5E0D6]/80" />
              待确认
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm border border-[#B98A54] bg-white ring-1 ring-[#B98A54]/30" />
              有申诉
            </span>
          </div>
        </div>
      )}

      {/* Claude 便签卡 Tooltip */}
      {hoveredCell && !openMenuCell && (
        <div
          className="pointer-events-none fixed z-50 flex max-h-[calc(100dvh-1rem)] w-64 flex-col items-start gap-1.5 overflow-y-auto rounded-xl border border-[#E5E0D6] bg-[#FDFCFB]/95 p-3.5 text-[12px] text-[#292524] shadow-claude-float ring-1 ring-[#1C1917]/5 backdrop-blur-md transition-opacity duration-100"
          style={tooltipPosition}
        >
          <div className="flex w-full items-center justify-between gap-2 border-b border-[#ECE7DE] pb-1.5">
            <span className="font-semibold text-[#1C1917]">
              {hoveredCell.dateKey}
            </span>
            <span className="font-medium text-[#78716C]">
              {hoveredCell.member.userName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`size-2 rounded-full ${getStatusColor(hoveredCell.status, Boolean(hoveredCell.record?.pendingExemption))}`}
            />
            <span className="font-medium text-[#1C1917]">
              {hoveredCell.record?.pendingExemption
                ? "请假待审批"
                : getStatusLabel(hoveredCell.status)}
            </span>
            {hoveredCell.record && hoveredCell.record.publishedCount > 0 && (
              <span className="text-[#78716C] tabular-nums">
                ({hoveredCell.record.publishedCount} 条视频)
              </span>
            )}
          </div>

          {hoveredCell.record?.reason && (
            <div className="w-full rounded-lg bg-[#F5F3EE]/60 p-2 text-[#292524] mt-1">
              <span className="block text-[11px] font-medium text-[#78716C]">
                标记原因：
              </span>
              <p className="mt-0.5 leading-[1.6] text-[#292524]">
                {hoveredCell.record.reason}
              </p>
              {hoveredCell.record.markedByName && (
                <span className="mt-1 block text-right text-[11px] text-[#78716C]">
                  — 标记人: {hoveredCell.record.markedByName}
                </span>
              )}
            </div>
          )}

          {hoveredCell.record?.pendingExemption && (
            <div className="mt-1 w-full rounded-lg bg-[#B98A54]/10 p-2 text-[#292524]">
              <span className="block text-[11px] font-medium text-[#B98A54]">
                待审批请假
              </span>
              <p className="mt-0.5 text-[12px] leading-[1.6]">
                {hoveredCell.record.pendingExemption.reason?.trim() || "未填写事由"}
              </p>
            </div>
          )}

          {hoveredCell.appeal && (
            <div className="w-full border border-[#B98A54]/20 bg-[#B98A54]/10 p-2 rounded-lg text-[#1C1917] mt-1">
              <div className="flex items-center gap-1 font-medium text-[11px] text-[#B98A54]">
                <span className="size-1.5 bg-[#B98A54] rounded-full" />
                员工申诉 (
                  {hoveredCell.appeal.status === "pending"
                  ? "待处理"
                  : hoveredCell.appeal.status === "approved"
                    ? "通过"
                    : "驳回"}
                )
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1C1917]">
                &ldquo;{hoveredCell.appeal.reason}&rdquo;
              </p>
              {hoveredCell.appeal.handler_name && (
                <span className="mt-1 block text-right text-[11px] text-[#B98A54]">
                  处理人: {hoveredCell.appeal.handler_name}
                </span>
              )}
            </div>
          )}

          <span className="mt-1 text-[11px] text-[#78716C]">
            点击方格可快捷改判
          </span>
        </div>
      )}

      {/* 快捷操作气泡 Popover */}
      {openMenuCell && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => setOpenMenuCell(null)}
          />
          <div
            className="fixed z-50 max-h-[calc(100dvh-1rem)] w-40 overflow-y-auto rounded-2xl border border-[#E5E0D6] bg-[#FDFCFB] p-1.5 text-[12px] shadow-claude-float ring-1 ring-[#1C1917]/5 animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: Math.min(
                typeof window !== "undefined" ? window.innerHeight - 200 : 600,
                openMenuCell.rect.bottom + 6,
              ),
              left: Math.min(
                typeof window !== "undefined" ? window.innerWidth - 90 : 500,
                Math.max(
                  90,
                  openMenuCell.rect.left + openMenuCell.rect.width / 2,
                ),
              ),
              transform: "translateX(-50%)",
            }}
          >
            <div className="px-2 py-1 text-[11px] font-medium text-[#78716C] border-b border-[#ECE7DE] mb-1">
              快捷改判 ({openMenuCell.member.userName} · {openMenuCell.day}日)
            </div>
            {openMenuCell.record?.pendingExemption && onReviewPendingExemption && (
              <div className="mb-1 border-b border-[#ECE7DE] pb-1">
                <div className="px-2 py-1 text-[11px] text-[#B98A54]">
                  请假待审批 · {openMenuCell.record.pendingExemption.reason?.trim() || "未填写事由"}
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    type="button"
                    disabled={reviewingRequestId === openMenuCell.record.pendingExemption.id}
                    onClick={async () => {
                      const requestId = openMenuCell.record?.pendingExemption?.id;
                      if (!requestId) return;
                      setReviewingRequestId(requestId);
                      try {
                        await onReviewPendingExemption(requestId, "approved");
                        setOpenMenuCell(null);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "这条请假审批没能保存，请重试");
                      } finally {
                        setReviewingRequestId(null);
                      }
                    }}
                    className="h-7 rounded-md bg-[#1C1917] px-2 text-[12px] font-medium text-white hover:bg-[#292524] transition-colors disabled:opacity-50"
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    disabled={reviewingRequestId === openMenuCell.record.pendingExemption.id}
                    onClick={async () => {
                      const requestId = openMenuCell.record?.pendingExemption?.id;
                      if (!requestId) return;
                      setReviewingRequestId(requestId);
                      try {
                        await onReviewPendingExemption(requestId, "rejected");
                        setOpenMenuCell(null);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "这条请假审批没能保存，请重试");
                      } finally {
                        setReviewingRequestId(null);
                      }
                    }}
                    className="h-7 rounded-md bg-transparent px-2 text-[12px] font-normal text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] transition-colors disabled:opacity-50"
                  >
                    驳回
                  </button>
                </div>
              </div>
            )}
            {onQuickMarkCell && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const { member, dateKey } = openMenuCell;
                    setOpenMenuCell(null);
                    void onQuickMarkCell(
                      member.userId,
                      dateKey,
                      "confirmed_published",
                    );
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#EFECE6] text-[#1C1917] flex items-center gap-2 text-[12px] font-medium transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#6FAA7D]" />
                  确认已发
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { member, dateKey } = openMenuCell;
                    setOpenMenuCell(null);
                    void onQuickMarkCell(member.userId, dateKey, "leave");
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#EFECE6] text-[#1C1917] flex items-center gap-2 text-[12px] transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#43718E]" />
                  标记请假
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { member, dateKey } = openMenuCell;
                    setOpenMenuCell(null);
                    void onQuickMarkCell(member.userId, dateKey, "waived");
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#EFECE6] text-[#1C1917] flex items-center gap-2 text-[12px] transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#43718E]/40" />
                  标记豁免
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { member, dateKey } = openMenuCell;
                    setOpenMenuCell(null);
                    void onQuickMarkCell(member.userId, dateKey, "absent");
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#C0685C]/10 text-[#C0685C] flex items-center gap-2 text-[12px] transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#C0685C]" />
                  确认缺勤
                </button>
                <div className="border-t border-[#ECE7DE] my-1" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const { member, dateKey } = openMenuCell;
                setOpenMenuCell(null);
                onCellClick(member, dateKey);
              }}
              className="w-full text-left rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-[#F5F3EE] text-[#292524] font-medium text-[12px] transition-colors"
            >
              📄 打开详情抽屉
            </button>
          </div>
        </>
      )}
    </div>
  );
}
