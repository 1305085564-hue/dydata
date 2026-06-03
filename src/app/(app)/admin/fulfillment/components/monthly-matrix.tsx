"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

import type { FulfillmentMemberSummary, FulfillmentStatus } from "@/types/fulfillment";
import { Button } from "@/components/ui/button";

interface MonthlyMatrixProps {
  year: number;
  month: number;
  members: FulfillmentMemberSummary[];
  today: string;
  onCellClick: (member: FulfillmentMemberSummary, date: string) => void;
  onMonthChange: (year: number, month: number) => void;
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
  if (!status) return "bg-zinc-100";
  switch (status) {
    case "published":
    case "confirmed_published":
      return "bg-[#6FAA7D]";
    case "leave":
      return "bg-[#8AA8C7]";
    case "waived":
    case "exempted":
      return "bg-[#8AA8C7]/50";
    case "absent":
      return "bg-[#C9604D]";
    case "unconfirmed":
      return "bg-zinc-300";
    default:
      return "bg-zinc-100";
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

export function MonthlyMatrix({ year, month, members, today, onCellClick, onMonthChange }: MonthlyMatrixProps) {
  const [expanded, setExpanded] = useState(false);
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

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
    <div className="space-y-3">
      {/* 折叠头部 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors duration-150 hover:bg-zinc-50/50"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-zinc-700">月度矩阵</h2>
          <span className="text-[12px] text-zinc-400">
            {year}年{month}月 · {members.length} 人
          </span>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-xs" onClick={handlePrevMonth}>
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-[72px] text-center text-[12px] font-medium text-zinc-600">
                {year}年{month}月
              </span>
              <Button variant="ghost" size="icon-xs" onClick={handleNextMonth}>
                <ChevronRight className="size-3.5" />
              </Button>
              {!isCurrentMonth() && (
                <Button variant="ghost" size="xs" onClick={handleCurrentMonth} className="ml-1 text-[11px]">
                  当月
                </Button>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-zinc-400" />
          ) : (
            <ChevronDown className="size-4 text-zinc-400" />
          )}
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="sticky left-0 z-10 min-w-[120px] border-r border-zinc-200 bg-white px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    成员
                  </th>
                  {dayNumbers.map((day) => {
                    const dateKey = formatDateKey(year, month, day);
                    const isToday = dateKey === today;
                    return (
                      <th
                        key={day}
                        className={`min-w-[28px] px-0.5 py-2 text-center text-[11px] font-medium tabular-nums ${
                          isToday ? "text-[#D97757]" : "text-zinc-400"
                        }`}
                      >
                        {day}
                      </th>
                    );
                  })}
                  <th className="min-w-[72px] border-l border-zinc-200 px-3 py-2 text-right text-[11px] font-medium text-zinc-400">
                    实发/应发
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-zinc-100 last:border-b-0">
                    <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-zinc-800">{member.userName}</span>
                        <span className="text-[11px] text-zinc-400">{member.groupName ?? member.teamName ?? ""}</span>
                      </div>
                    </td>
                    {dayNumbers.map((day) => {
                      const dateKey = formatDateKey(year, month, day);
                      const record = member.days[dateKey];
                      const status = record?.status;
                      const isToday = dateKey === today;

                      return (
                        <td key={day} className="px-0.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => onCellClick(member, dateKey)}
                            title={`${member.userName} · ${dateKey} · ${getStatusLabel(status)}`}
                            className={`mx-auto block size-[18px] rounded-sm transition-transform duration-150 hover:scale-125 ${getStatusColor(status)} ${
                              isToday ? "ring-1 ring-[#D97757]/40" : ""
                            }`}
                          />
                        </td>
                      );
                    })}
                    <td className="border-l border-zinc-200 px-3 py-2 text-right">
                      <span
                        className={`font-mono text-[12px] tabular-nums font-medium ${
                          member.publishedDays >= member.totalDays
                            ? "text-[#6FAA7D]"
                            : member.publishedDays / member.totalDays >= 0.6
                              ? "text-zinc-700"
                              : "text-[#C9604D]"
                        }`}
                      >
                        {member.publishedDays}
                      </span>
                      <span className="mx-0.5 text-[11px] text-zinc-300">/</span>
                      <span className="font-mono text-[12px] tabular-nums text-zinc-400">
                        {member.totalDays}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 图例 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#6FAA7D]" />
              已发布
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#8AA8C7]" />
              请假
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#8AA8C7]/50" />
              豁免
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-[#C9604D]" />
              缺勤
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[10px] rounded-sm bg-zinc-300" />
              待确认
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
