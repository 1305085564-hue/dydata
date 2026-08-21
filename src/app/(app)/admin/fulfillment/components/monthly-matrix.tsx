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

function getStatusColor(status: FulfillmentStatus | undefined): string {
  if (!status) return "bg-zinc-50 border-zinc-100";
  switch (status) {
    case "published":
    case "confirmed_published":
      return "bg-[#6FAA7D] border-[#5d946a]";
    case "leave":
      return "bg-[#43718E] border-[#5283A2]";
    case "waived":
    case "exempted":
      return "bg-[#43718E]/30 border-[#43718E]/20";
    case "absent":
      return "bg-[#C9604D] border-[#b5503e]";
    case "unconfirmed":
      return "bg-zinc-200 border-zinc-300";
    default:
      return "bg-zinc-50 border-zinc-100";
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
}: MonthlyMatrixProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<ActiveCellData | null>(null);
  const [openMenuCell, setOpenMenuCell] = useState<ActiveCellData | null>(null);

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

  return (
    <div className="space-y-3">
      {/* 折叠头部 */}
      <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors duration-150 select-none hover:bg-zinc-50/50">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="monthly-matrix-panel"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="text-[18px] font-semibold text-zinc-900">
              月度矩阵
            </span>
            <span className="truncate text-[12px] text-zinc-500">
              {year}年{month}月 · {members.length} 人
            </span>
          </span>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-zinc-500" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-zinc-500" />
          )}
        </button>
        {expanded && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="上一月"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-[72px] text-center text-[12px] font-medium text-zinc-700">
              {year}年{month}月
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="下一月"
              onClick={handleNextMonth}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            {!isCurrentMonth() && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleCurrentMonth}
                className="ml-1 text-[12px]"
              >
                当月
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div id="monthly-matrix-panel" className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-200/60 bg-zinc-50/50">
                  <th className="sticky left-0 z-10 min-w-[120px] border-r border-zinc-200 bg-white px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                    成员
                  </th>
                  {dayNumbers.map((day) => {
                    const dateKey = formatDateKey(year, month, day);
                    const isToday = dateKey === today;
                    return (
                      <th
                        key={day}
                        className={`min-w-[28px] px-0.5 py-1.5 text-center text-[12px] font-normal tabular-nums ${
                          isToday
                            ? "text-[#D97757] font-medium"
                            : "text-zinc-500"
                        }`}
                      >
                        {day}
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 min-w-[72px] border-l border-zinc-200/60 bg-zinc-50 px-3 py-1.5 text-right text-[12px] font-normal text-zinc-500 shadow-[-2px_0_5px_rgba(0,0,0,0.01)]">
                    实发/应发
                  </th>
                </tr>
              </thead>

              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.userId}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50 transition-colors"
                  >
                    <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-1 shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-[13px] font-medium text-zinc-900">
                          {member.userName}
                        </span>
                        {member.teamName && (
                          <span className="text-[12px] text-zinc-400">
                            {member.teamName}
                          </span>
                        )}
                      </div>
                    </td>
                    {dayNumbers.map((day) => {
                      const dateKey = formatDateKey(year, month, day);
                      const record = member.days[dateKey];
                      const status = record?.status;
                      const isToday = dateKey === today;
                      const appeal = appealMap.get(
                        `${member.userId}_${dateKey}`,
                      );

                      return (
                        <td key={day} className="px-0.5 py-1">
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
                            className={`mx-auto block size-[16px] rounded-[3px] border transition-colors duration-100 hover:scale-110 hover:z-10 cursor-pointer ${getStatusColor(status)} ${
                              isToday
                                ? "ring-1 ring-[#D97757] ring-offset-1 z-10"
                                : ""
                            } ${appeal ? "ring-1.5 ring-[#F59E0B] ring-offset-0.5" : ""}`}
                          />
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-l border-zinc-200/60 bg-white px-3 py-2 text-right shadow-[-2px_0_5px_rgba(0,0,0,0.01)]">
                      <span
                        className={`text-[12px] tabular-nums font-medium ${
                          member.publishedDays >= member.totalDays
                            ? "text-[#6FAA7D]"
                            : member.publishedDays / member.totalDays >= 0.6
                              ? "text-zinc-700"
                              : "text-[#C9604D]"
                        }`}
                      >
                        {member.publishedDays}
                      </span>
                      <span className="mx-0.5 text-[12px] text-zinc-500">
                        /
                      </span>
                      <span className="text-[12px] tabular-nums text-zinc-500">
                        {member.totalDays}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 图例 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-zinc-100/50 p-2.5 text-[12px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#6FAA7D] border border-[#5d946a]" />
              已发布 / 已确认
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#43718E] border border-[#5283A2]" />
              请假
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#43718E]/30 border border-[#43718E]/20" />
              豁免 / 豁免期
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#C9604D] border border-[#b5503e]" />
              缺勤
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-zinc-200 border border-zinc-300" />
              待确认
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm border border-[#F59E0B] bg-white" />
              有待处理申诉
            </span>
          </div>
        </div>
      )}

      {/* 🚀 单例 Tooltip（悬浮提示） */}
      {hoveredCell && !openMenuCell && (
        <div
          className="fixed z-50 flex w-60 flex-col items-start gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-[12px] text-white shadow-xl pointer-events-none transition-opacity duration-100"
          style={{
            top: Math.max(10, hoveredCell.rect.top - 8),
            left: Math.min(
              typeof window !== "undefined" ? window.innerWidth - 130 : 500,
              Math.max(130, hoveredCell.rect.left + hoveredCell.rect.width / 2),
            ),
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 pb-1.5">
            <span className="font-medium text-zinc-50">
              {hoveredCell.dateKey}
            </span>
            <span className="font-medium text-zinc-400">
              {hoveredCell.member.userName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`size-2 rounded-full ${getStatusColor(hoveredCell.status)}`}
            />
            <span className="font-normal">
              {getStatusLabel(hoveredCell.status)}
            </span>
            {hoveredCell.record && hoveredCell.record.publishedCount > 0 && (
              <span className="text-zinc-400 tabular-nums">
                ({hoveredCell.record.publishedCount} 条视频)
              </span>
            )}
          </div>
          <span className="mt-1 text-[11px] text-zinc-400">
            点击弹出快捷改判菜单 ➔
          </span>

          {hoveredCell.record?.reason && (
            <div className="w-full rounded border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300">
              <span className="block text-[11px] font-normal text-zinc-400">
                打标原因：
              </span>
              <p className="mt-0.5 leading-[1.6] text-zinc-100">
                {hoveredCell.record.reason}
              </p>
              {hoveredCell.record.markedByName && (
                <span className="mt-1 block text-right text-[11px] text-zinc-400">
                  — 标记人: {hoveredCell.record.markedByName}
                </span>
              )}
            </div>
          )}

          {hoveredCell.appeal && (
            <div className="w-full border border-[#F59E0B]/20 bg-zinc-950/10 p-1.5 rounded text-[#B45309] mt-1">
              <div className="flex items-center gap-1 font-normal text-[11px]">
                <span className="size-1 bg-[#F59E0B] rounded-full" />
                员工申诉 (
                {hoveredCell.appeal.status === "pending"
                  ? "待处理"
                  : hoveredCell.appeal.status === "approved"
                    ? "申诉通过"
                    : "被驳回"}
                )
              </div>
              <p className="mt-1 text-[12px] italic leading-[1.7] text-zinc-100">
                &ldquo;{hoveredCell.appeal.reason}&rdquo;
              </p>
              {hoveredCell.appeal.handler_name && (
                <span className="mt-1 block text-right text-[11px] text-zinc-400">
                  处理人: {hoveredCell.appeal.handler_name}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 🚀 单例 Popover（快捷操作气泡） */}
      {openMenuCell && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => setOpenMenuCell(null)}
          />
          <div
            className="fixed z-50 w-36 bg-white border border-zinc-200 rounded-xl p-1 shadow-2xl text-[12px] animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: Math.min(
                typeof window !== "undefined" ? window.innerHeight - 200 : 600,
                openMenuCell.rect.bottom + 6,
              ),
              left: Math.min(
                typeof window !== "undefined" ? window.innerWidth - 80 : 500,
                Math.max(
                  80,
                  openMenuCell.rect.left + openMenuCell.rect.width / 2,
                ),
              ),
              transform: "translateX(-50%)",
            }}
          >
            <div className="px-2 py-1 text-[11px] font-medium text-zinc-400 border-b border-zinc-100 mb-1">
              快捷改判 ({openMenuCell.member.userName} · {openMenuCell.day}日)
            </div>
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
                  className="w-full text-left rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-50 text-zinc-800 flex items-center gap-1.5 text-[12px] transition-colors"
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
                  className="w-full text-left rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-50 text-zinc-800 flex items-center gap-1.5 text-[12px] transition-colors"
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
                  className="w-full text-left rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-50 text-zinc-800 flex items-center gap-1.5 text-[12px] transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#43718E]/50" />
                  标记豁免
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { member, dateKey } = openMenuCell;
                    setOpenMenuCell(null);
                    void onQuickMarkCell(member.userId, dateKey, "absent");
                  }}
                  className="w-full text-left rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-100 text-[#DC2626] flex items-center gap-1.5 text-[12px] transition-colors"
                >
                  <span className="size-2 rounded-full bg-[#C9604D]" />
                  确认缺勤
                </button>
                <div className="border-t border-zinc-100 my-1" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const { member, dateKey } = openMenuCell;
                setOpenMenuCell(null);
                onCellClick(member, dateKey);
              }}
              className="w-full text-left rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-50 text-zinc-600 font-medium text-[12px] transition-colors"
            >
              📄 查看完整抽屉
            </button>
          </div>
        </>
      )}
    </div>
  );
}
