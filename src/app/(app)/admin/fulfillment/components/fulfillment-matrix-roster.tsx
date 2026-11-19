"use client";

import { useMemo, useState, useEffect } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { FulfillmentMemberSummary, FulfillmentStatus } from "@/types/fulfillment";
import { Button } from "@/components/ui/button";
import {
  isFulfilledFulfillmentStatus,
  isWaivedFulfillmentStatus,
  isManualFulfillmentMarkStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";
import { cn } from "@/lib/utils";
import { isMissingStreak, type RosterSortDir } from "../fulfillment-page-view";

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
  /** 已按分段收窄、按排序排好的成员 */
  members: FulfillmentMemberSummary[];
  today: string;
  onCellClick: (member: FulfillmentMemberSummary, date: string) => void;
  appeals?: FulfillmentAppeal[];
  onQuickMarkCell?: (userId: string, date: string, action: ManualFulfillmentMarkStatus) => Promise<void>;
  onClearManualOverride?: (userId: string, date: string) => Promise<void>;
  onReviewPendingExemption?: (requestId: string, action: "approved" | "rejected") => Promise<void>;
  sortDir: RosterSortDir;
  /** 断更分段按连续未发天数排，此时「本月」列不可排序 */
  onSortDirChange?: (dir: RosterSortDir) => void;
  isLoading?: boolean;
  emptyText: string;
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
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const TOOLTIP_ESTIMATED_HEIGHT = 220;

export function getTooltipPlacement(rect: DOMRect, viewportWidth: number, viewportHeight: number) {
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

/**
 * 格子只有四种底 + 一种框（原来五种颜色 + 今日橙圈 + 申诉黄圈）：
 * 已发（绿）· 请假/豁免（不计考核，浅砂）· 缺勤（红）· 未确认（白底细边）；有待审的（补交或请假）加虚线框。
 * 红绿按「异常信号」用：绿=没问题，红=缺勤。
 */
export type CellTone = "published" | "excused" | "absent" | "unconfirmed" | "none";

export function getCellTone(status: FulfillmentStatus | undefined): CellTone {
  if (!status) return "none";
  if (isFulfilledFulfillmentStatus(status)) return "published";
  if (status === "leave" || isWaivedFulfillmentStatus(status)) return "excused";
  if (status === "absent") return "absent";
  return "unconfirmed";
}

const CELL_TONE_CLASS: Record<CellTone, string> = {
  published: "bg-status-success/25 border-status-success/40",
  excused: "bg-[#E2E2DF] border-[#E2E2DF]",
  absent: "bg-status-danger/40 border-status-danger/55",
  unconfirmed: "bg-white border-[#E2E2DF]",
  none: "bg-transparent border-transparent",
};

const PENDING_CELL_CLASS = "border-dashed border-status-warning";

const LEGEND: { tone: CellTone; label: string }[] = [
  { tone: "published", label: "已发" },
  { tone: "excused", label: "请假 / 豁免" },
  { tone: "absent", label: "缺勤" },
  { tone: "unconfirmed", label: "未确认" },
];

function getStatusLabel(status: FulfillmentStatus | undefined): string {
  if (!status) return "不在考核内";
  const labels: Record<FulfillmentStatus, string> = {
    published: "已发",
    confirmed_published: "已发（人工确认）",
    leave: "请假",
    waived: "豁免",
    exempted: "豁免期",
    absent: "缺勤",
    unconfirmed: "未确认",
  };
  return labels[status] ?? status;
}

const MENU_ACTIONS: { action: ManualFulfillmentMarkStatus; label: string }[] = [
  { action: "confirmed_published", label: "标为已发" },
  { action: "leave", label: "标为请假" },
  { action: "waived", label: "标为豁免" },
  { action: "absent", label: "标为缺勤" },
];

const MENU_BUTTON =
  "flex h-8 items-center justify-center rounded-md border border-[#E2E2DF] bg-white text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9]";

const NAME_COL = "w-[112px] min-w-[112px] max-w-[112px]";
const MONTH_COL = "w-[148px] min-w-[148px] max-w-[148px]";

/**
 * 全员月历大表：一行一人，左两列固定（成员 · 本月），右边是这个月每一天。
 * 标题、翻月、分段都在页头和工具栏，这里不再自带标题、排序胶囊和月份切换。
 */
export function FulfillmentMatrixRoster({
  year,
  month,
  members,
  today,
  onCellClick,
  appeals = [],
  onQuickMarkCell,
  onClearManualOverride,
  onReviewPendingExemption,
  sortDir,
  onSortDirChange,
  isLoading = false,
  emptyText,
}: FulfillmentMatrixRosterProps) {
  const [hoveredCell, setHoveredCell] = useState<ActiveCellData | null>(null);
  const [openMenuCell, setOpenMenuCell] = useState<ActiveCellData | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

  const dayNumbers = useMemo(
    () => Array.from({ length: getDaysInMonth(year, month) }, (_, i) => i + 1),
    [year, month],
  );

  const appealMap = useMemo(() => {
    const map = new Map<string, FulfillmentAppeal>();
    for (const appeal of appeals) {
      if (appeal.status === "pending") map.set(`${appeal.user_id}_${appeal.record_date}`, appeal);
    }
    return map;
  }, [appeals]);

  // 滚动时收起悬停卡片，Esc 收起菜单
  useEffect(() => {
    const handleScrollOrKey = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") {
          setOpenMenuCell(null);
          setHoveredCell(null);
        }
      } else {
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

  const activeCell = openMenuCell || hoveredCell;
  const activeDay = activeCell?.day;
  const activeUserId = activeCell?.member.userId;
  const tooltipPosition =
    activeCell && typeof window !== "undefined"
      ? getTooltipPlacement(activeCell.rect, window.innerWidth, window.innerHeight)
      : undefined;

  const runAndClose = async (task: () => Promise<void>) => {
    await task();
    setOpenMenuCell(null);
  };

  const reviewLeave = async (action: "approved" | "rejected") => {
    const reqId = openMenuCell?.record?.pendingExemption?.id;
    if (!reqId || !onReviewPendingExemption) return;
    setReviewingRequestId(reqId);
    try {
      await onReviewPendingExemption(reqId, action);
      setOpenMenuCell(null);
    } finally {
      setReviewingRequestId(null);
    }
  };

  const sortable = Boolean(onSortDirChange);
  const ariaSort = sortable ? (sortDir === "asc" ? "ascending" : "descending") : undefined;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-[#E2E2DF] bg-white transition-opacity duration-150",
          isLoading && "opacity-50",
        )}
        aria-busy={isLoading || undefined}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E2E2DF] text-[12px] text-[#78716C]">
              <th className={cn("sticky left-0 z-20 bg-white px-3 py-2.5 text-left font-normal", NAME_COL)}>成员</th>
              <th
                aria-sort={ariaSort}
                className={cn("sticky left-[112px] z-20 border-r border-[#E2E2DF] bg-white px-3 py-2.5 text-left font-normal", MONTH_COL)}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => onSortDirChange?.(sortDir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 rounded-md text-[#1F1E1D] hover:text-[#141413] cursor-pointer"
                    title={sortDir === "asc" ? "落后的在前，点一下改成领先的在前" : "领先的在前，点一下改成落后的在前"}
                  >
                    本月
                    {sortDir === "asc" ? (
                      <ArrowUp className="size-3 text-[#141413]" aria-hidden />
                    ) : (
                      <ArrowDown className="size-3 text-[#141413]" aria-hidden />
                    )}
                  </button>
                ) : (
                  <span>本月 · 按断更天数</span>
                )}
              </th>
              {dayNumbers.map((day, index) => {
                const dateKey = formatDateKey(year, month, day);
                const isToday = dateKey === today;
                return (
                  <th
                    key={day}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "min-w-[26px] py-2.5 text-center text-[12px] font-normal tabular-nums",
                      index === 0 ? "pl-2.5 pr-0.5" : index === dayNumbers.length - 1 ? "pl-0.5 pr-2.5" : "px-0.5",
                      isToday || day === activeDay ? "bg-[#F1F1F0] text-[#141413]" : "text-[#A8A29E]",
                    )}
                  >
                    {day}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={dayNumbers.length + 2} className="px-3 py-10 text-center text-[14px] text-[#78716C]">
                  {emptyText}
                </td>
              </tr>
            ) : (
              members.map((member) => {
                const isRowActive = member.userId === activeUserId;
                const assessedDays = member.requiredCount + member.leaveDays + member.waivedDays;
                const excusedDays = member.leaveDays + member.waivedDays;
                const stickyBg = isRowActive ? "bg-[#F7F7F6]" : "bg-white";
                return (
                  <tr
                    key={member.userId}
                    className={cn(
                      "border-b border-[#E2E2DF]/60 last:border-b-0",
                      isRowActive ? "bg-[#F7F7F6]" : "hover:bg-[#F7F7F6]",
                    )}
                  >
                    <td className={cn("sticky left-0 z-10 px-3 py-2", NAME_COL, stickyBg)}>
                      <button
                        type="button"
                        onClick={() => onCellClick(member, today)}
                        className="flex w-full flex-col items-start overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info/20 rounded-md"
                      >
                        <span className="w-full truncate text-[14px] text-[#141413] hover:underline underline-offset-2">
                          {member.userName}
                        </span>
                        {member.teamName && (
                          <span className="w-full truncate text-[12px] text-[#78716C]">{member.teamName}</span>
                        )}
                      </button>
                    </td>

                    <td className={cn("sticky left-[112px] z-10 border-r border-[#E2E2DF] px-3 py-2", MONTH_COL, stickyBg)}>
                      <div className="flex items-baseline gap-2 tabular-nums">
                        <span className="text-[14px] text-[#141413]">
                          {member.publishedCount}
                          <span className="text-[12px] text-[#A8A29E]"> / {member.requiredCount}</span>
                        </span>
                        <span className="text-[12px] text-[#78716C]">{member.fulfillmentRate}%</span>
                        {isMissingStreak(member) && (
                          <span className="text-[12px] text-status-danger">断 {member.consecutiveMissing} 天</span>
                        )}
                      </div>
                      <div
                        className="text-[12px] tabular-nums text-[#A8A29E]"
                        title={`考核 ${assessedDays} 天，请假 ${member.leaveDays} 天、豁免 ${member.waivedDays} 天不算应发，应发 ${member.requiredCount} 条`}
                      >
                        考核 {assessedDays} 天{excusedDays > 0 ? ` · 假免 ${excusedDays}` : ""}
                      </div>
                    </td>

                    {dayNumbers.map((day, index) => {
                      const dateKey = formatDateKey(year, month, day);
                      const record = member.days[dateKey];
                      const status = record?.status;
                      const appeal = appealMap.get(`${member.userId}_${dateKey}`);
                      const hasPending = Boolean(record?.pendingExemption) || Boolean(appeal);
                      const cell = { member, dateKey, day, status, record, appeal };
                      return (
                        <td
                          key={day}
                          className={cn(
                            "py-1.5",
                            index === 0 ? "pl-2.5 pr-0.5" : index === dayNumbers.length - 1 ? "pl-0.5 pr-2.5" : "px-0.5",
                            (dateKey === today || day === activeDay) && !isRowActive && "bg-[#F7F7F6]",
                          )}
                        >
                          <button
                            type="button"
                            data-date={dateKey}
                            aria-label={`${member.userName} ${month}月${day}日：${getStatusLabel(status)}${hasPending ? "，有待审" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuCell({ ...cell, rect: e.currentTarget.getBoundingClientRect() });
                              setHoveredCell(null);
                            }}
                            onMouseEnter={(e) => {
                              if (openMenuCell) return;
                              setHoveredCell({ ...cell, rect: e.currentTarget.getBoundingClientRect() });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={cn(
                              "relative mx-auto flex size-[22px] items-center justify-center rounded-md border cursor-pointer transition-colors duration-150 hover:border-[#78716C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info/20",
                              CELL_TONE_CLASS[getCellTone(status)],
                              hasPending && PENDING_CELL_CLASS,
                            )}
                          >
                            {record?.publishedCount != null && record.publishedCount >= 2 && (
                              <span className="pointer-events-none text-[12px] leading-none tabular-nums text-[#1F1E1D]">
                                {record.publishedCount}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-[#78716C]">
        {LEGEND.map((item) => (
          <span key={item.tone} className="inline-flex items-center gap-1">
            <span className={cn("inline-block size-3 rounded-md border", CELL_TONE_CLASS[item.tone])} />
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className={cn("inline-block size-3 rounded-md border bg-white", PENDING_CELL_CLASS)} />
          有待审
        </span>
        <span className="text-[#A8A29E]">格子里的数字 = 当天发了几条 · 点格子可改判</span>
      </div>

      {hoveredCell && tooltipPosition && !openMenuCell && (
        <div
          style={{
            position: "fixed",
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: tooltipPosition.transform,
            zIndex: 50,
          }}
          className="pointer-events-none w-64 space-y-1 rounded-xl border border-[#E2E2DF] bg-white p-3 text-[12px] text-[#78716C] shadow-claude-float"
        >
          <p className="text-[14px] text-[#141413]">
            {hoveredCell.member.userName} · {month}月{hoveredCell.day}日 · {getStatusLabel(hoveredCell.status)}
          </p>
          <p>
            发了 <span className="tabular-nums text-[#141413]">{hoveredCell.record?.publishedCount || 0}</span> 条
            {hoveredCell.record?.markedByName ? ` · ${hoveredCell.record.markedByName} 标记` : ""}
          </p>
          {hoveredCell.record?.reason && <p>备注：{hoveredCell.record.reason}</p>}
          {hoveredCell.record?.pendingExemption && (
            <p className="text-[#1F1E1D]">
              {hoveredCell.record.pendingExemption.exemption_type === "leave" ? "请假" : "免交"}待批
              {hoveredCell.record.pendingExemption.reason ? `：${hoveredCell.record.pendingExemption.reason}` : ""}
            </p>
          )}
          {hoveredCell.appeal && <p className="text-[#1F1E1D]">补交待审：{hoveredCell.appeal.reason}</p>}
        </div>
      )}

      {openMenuCell && tooltipPosition && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuCell(null)} />
          <div
            role="dialog"
            aria-label={`${openMenuCell.member.userName} ${month}月${openMenuCell.day}日`}
            style={{
              position: "fixed",
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              transform: tooltipPosition.transform,
              zIndex: 50,
            }}
            className="max-h-[calc(100dvh-1rem)] w-72 space-y-3 overflow-y-auto rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-claude-float"
          >
            <p className="text-[14px] text-[#141413]">
              {openMenuCell.member.userName} · {month}月{openMenuCell.day}日
              <span className="ml-2 text-[12px] text-[#78716C]">{getStatusLabel(openMenuCell.status)}</span>
            </p>

            {openMenuCell.record?.pendingExemption && onReviewPendingExemption && (
              <div className="space-y-1 border-t border-[#E2E2DF]/60 pt-2">
                <p className="text-[12px] text-[#78716C]">
                  {openMenuCell.record.pendingExemption.exemption_type === "leave" ? "请假" : "免交"}待批
                  {openMenuCell.record.pendingExemption.reason ? `：${openMenuCell.record.pendingExemption.reason}` : ""}
                </p>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={Boolean(reviewingRequestId)}
                    className="h-7 px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                    onClick={() => void reviewLeave("approved")}
                  >
                    批准
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={Boolean(reviewingRequestId)}
                    className="h-7 px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                    onClick={() => void reviewLeave("rejected")}
                  >
                    驳回
                  </Button>
                </div>
              </div>
            )}

            {onQuickMarkCell && (
              <div className="space-y-2 border-t border-[#E2E2DF]/60 pt-2">
                <div className="grid grid-cols-2 gap-1">
                  {MENU_ACTIONS.map(({ action, label }) => (
                    <button
                      key={action}
                      type="button"
                      className={MENU_BUTTON}
                      onClick={() =>
                        void runAndClose(() => onQuickMarkCell(openMenuCell.member.userId, openMenuCell.dateKey, action))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {Boolean(openMenuCell.record && isManualFulfillmentMarkStatus(openMenuCell.record.status)) &&
                  onClearManualOverride && (
                    <button
                      type="button"
                      className={cn(MENU_BUTTON, "w-full")}
                      onClick={() =>
                        void runAndClose(() => onClearManualOverride(openMenuCell.member.userId, openMenuCell.dateKey))
                      }
                    >
                      撤掉人工标记，按系统判定
                    </button>
                  )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-[#E2E2DF]/60 pt-2 text-[12px]">
              <button
                type="button"
                onClick={() => {
                  const { member, dateKey } = openMenuCell;
                  setOpenMenuCell(null);
                  onCellClick(member, dateKey);
                }}
                className="text-[#1F1E1D] hover:underline underline-offset-2"
              >
                看 {openMenuCell.member.userName} 这个月 →
              </button>
              <button type="button" onClick={() => setOpenMenuCell(null)} className="text-[#78716C] hover:text-[#141413]">
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
