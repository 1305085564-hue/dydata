"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

import type { FulfillmentMemberSummary, FulfillmentStatus } from "@/types/fulfillment";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

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
  if (!status) return "bg-stone-50 border-stone-100";
  switch (status) {
    case "published":
    case "confirmed_published":
      return "bg-[#6FAA7D] border-[#5d946a]";
    case "leave":
      return "bg-[#8AA8C7] border-[#7a9ab8]";
    case "waived":
    case "exempted":
      return "bg-[#8AA8C7]/30 border-[#8AA8C7]/20";
    case "absent":
      return "bg-[#C9604D] border-[#b5503e]";
    case "unconfirmed":
      return "bg-stone-200 border-stone-300";
    default:
      return "bg-stone-50 border-stone-100";
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
}: MonthlyMatrixProps) {
  const [expanded, setExpanded] = useState(false);
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

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

  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth() + 1);
  };

  const isCurrentMonth = () => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  };

  return (
    <TooltipProvider delay={100}>
      <div className="space-y-3">
        {/* 折叠头部 */}
        <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200/60 bg-white px-4 py-3 text-left transition-colors duration-150 select-none hover:bg-stone-50/50">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="monthly-matrix-panel"
            onClick={() => setExpanded((current) => !current)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="text-[18px] font-medium text-stone-900">月度矩阵</span>
              <span className="truncate text-[12px] text-stone-500">
                {year}年{month}月 · {members.length} 人
              </span>
            </span>
            {expanded ? (
              <ChevronUp className="size-4 shrink-0 text-stone-500" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-stone-500" />
            )}
          </button>
          {expanded && (
            <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-xs" aria-label="上一月" onClick={handlePrevMonth}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="min-w-[72px] text-center text-[12px] font-medium text-stone-700">
                  {year}年{month}月
                </span>
                <Button variant="ghost" size="icon-xs" aria-label="下一月" onClick={handleNextMonth}>
                  <ChevronRight className="size-3.5" />
                </Button>
                {!isCurrentMonth() && (
                  <Button variant="ghost" size="xs" onClick={handleCurrentMonth} className="ml-1 text-[12px]">
                    当月
                  </Button>
                )}
            </div>
          )}
        </div>

        {/* 展开内容 */}
        {expanded && (
          <div id="monthly-matrix-panel" className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-stone-200/60">
                    <th className="sticky left-0 z-10 min-w-[120px] border-r border-stone-200/60 bg-white px-3 py-2 text-left text-[12px] font-normal tracking-[0.12em] text-stone-500">
                      成员
                    </th>
                    {dayNumbers.map((day) => {
                      const dateKey = formatDateKey(year, month, day);
                      const isToday = dateKey === today;
                      return (
                        <th
                          key={day}
                          className={`min-w-[28px] px-0.5 py-2 text-center text-[12px] font-normal tabular-nums ${
                            isToday ? "text-[#D97757] font-medium" : "text-stone-500"
                          }`}
                        >
                          {day}
                        </th>
                      );
                    })}
                    <th className="min-w-[72px] border-l border-stone-200/60 px-3 py-2 text-right text-[12px] font-normal text-stone-500">
                      实发/应发
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {members.map((member) => (
                    <tr key={member.userId} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/10 transition-colors">
                      <td className="sticky left-0 z-10 border-r border-stone-200/60 bg-white px-3 py-2 shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium text-stone-900">{member.userName}</span>
                          <span className="text-[12px] text-stone-500">{member.groupName ?? member.teamName ?? ""}</span>
                        </div>
                      </td>
                      {dayNumbers.map((day) => {
                        const dateKey = formatDateKey(year, month, day);
                        const record = member.days[dateKey];
                        const status = record?.status;
                        const isToday = dateKey === today;
                        const appeal = appealMap.get(`${member.userId}_${dateKey}`);

                        return (
                          <td key={day} className="px-0.5 py-1.5">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={() => onCellClick(member, dateKey)}
                                    className={`mx-auto block size-[16px] rounded-[3px] border transition-all duration-150 hover:scale-110 hover:z-10 ${getStatusColor(status)} ${
                                      isToday ? "ring-1 ring-[#D97757] ring-offset-1 z-10" : ""
                                    } ${appeal ? "ring-1.5 ring-amber-500 ring-offset-0.5" : ""}`}
                                  />
                                }
                              />
                              <TooltipContent
                                className="z-50 flex w-60 flex-col items-start gap-1.5 rounded-lg border border-stone-700 bg-stone-900 p-3 text-[12px] text-white shadow-lg"
                                align="center"
                                side="top"
                              >
                                <div className="flex w-full items-center justify-between gap-2 border-b border-stone-800 pb-1.5">
                                  <span className="font-medium text-stone-50">{dateKey}</span>
                                  <span className="font-medium text-stone-500">{member.userName}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`size-2 rounded-full ${getStatusColor(status)}`} />
                                  <span className="font-normal">{getStatusLabel(status)}</span>
                                  {record && record.publishedCount > 0 && (
                                    <span className="text-stone-500 tabular-nums">({record.publishedCount} 条视频)</span>
                                  )}
                                </div>
                                
                                {record?.reason && (
                                  <div className="w-full rounded border border-stone-300 bg-stone-100 p-1.5 text-stone-500">
                                    <span className="block text-[12px] font-normal text-stone-500">打标原因：</span>
                                    <p className="mt-0.5 leading-[1.6] text-stone-100">{record.reason}</p>
                                    {record.markedByName && (
                                      <span className="mt-1 block text-right text-[12px] text-stone-500">— 标记人: {record.markedByName}</span>
                                    )}
                                  </div>
                                )}

                                {appeal && (
                                  <div className="w-full border border-amber-500/20 bg-amber-500/10 p-1.5 rounded text-amber-200 mt-1">
                                    <div className="flex items-center gap-1 font-normal">
                                      <span className="size-1 bg-amber-400 rounded-full" />
                                      员工申诉 ({appeal.status === "pending" ? "待处理" : appeal.status === "approved" ? "申诉通过" : "被驳回"})
                                    </div>
                                    <p className="mt-1 text-[12px] italic leading-[1.7] text-stone-100">
                                      &ldquo;{appeal.reason}&rdquo;
                                    </p>
                                    {appeal.handler_name && (
                                      <span className="mt-1 block text-right text-[12px] text-stone-500">处理人: {appeal.handler_name}</span>
                                    )}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="border-l border-stone-200/60 px-3 py-2 text-right">
                        <span
                          className={`text-[12px] tabular-nums font-medium ${
                            member.publishedDays >= member.totalDays
                              ? "text-[#6FAA7D]"
                              : member.publishedDays / member.totalDays >= 0.6
                                ? "text-stone-700"
                                : "text-[#C9604D]"
                          }`}
                        >
                          {member.publishedDays}
                        </span>
                        <span className="mx-0.5 text-[12px] text-stone-500">/</span>
                        <span className="text-[12px] tabular-nums text-stone-500">
                          {member.totalDays}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 图例 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-stone-100/50 p-2.5 text-[12px] text-stone-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm bg-[#6FAA7D] border border-[#5d946a]" />
                已发布 / 已确认
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm bg-[#8AA8C7] border border-[#7a9ab8]" />
                请假
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm bg-[#8AA8C7]/30 border border-[#8AA8C7]/20" />
                豁免 / 豁免期
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm bg-[#C9604D] border border-[#b5503e]" />
                缺勤
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm bg-stone-200 border border-stone-300" />
                待确认
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-[10px] rounded-sm border border-amber-500 bg-white" />
                有待处理申诉
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
