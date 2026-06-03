"use client";

import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ExceptionQueueProps {
  members: FulfillmentMemberSummary[];
  onMemberClick: (member: FulfillmentMemberSummary, index: number) => void;
}

export function ExceptionQueue({ members, onMemberClick }: ExceptionQueueProps) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white py-12">
        <div className="flex size-12 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50">
          <CheckCircle2 className="size-5 text-[#6FAA7D]" />
        </div>
        <p className="text-[14px] font-medium text-zinc-600">今日发布状态已全部确认</p>
        <p className="text-[12px] text-zinc-400">所有成员今日状态已处理完毕</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-[#D99E55]" />
        <h2 className="text-[14px] font-semibold text-zinc-700">
          待处理异常
          <span className="ml-1.5 font-mono text-[12px] tabular-nums text-zinc-400">
            {members.length}
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member, index) => {
          const todayRecord = member.days[Object.keys(member.days)[0]];
          const lastDate = Object.keys(member.days)
            .filter((d) => {
              const s = member.days[d].status;
              return s === "published" || s === "confirmed_published";
            })
            .sort()
            .pop();

          return (
            <button
              key={member.userId}
              type="button"
              onClick={() => onMemberClick(member, index)}
              className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-zinc-800">{member.userName}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-400">
                    {member.groupName ?? member.teamName ?? "无团队"}
                  </p>
                </div>
                {member.consecutiveMissing > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#C9604D]/15 bg-[#C9604D]/[0.04] px-2 py-0.5 text-[11px] font-medium text-[#C9604D]">
                    <span className="size-1 rounded-full bg-[#C9604D]" />
                    连续 {member.consecutiveMissing} 天
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-4 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">上次发布</span>
                  <span className="font-mono tabular-nums font-medium text-zinc-700">
                    {lastDate ? lastDate.slice(5) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">本月发布率</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      member.fulfillmentRate >= 80
                        ? "text-[#6FAA7D]"
                        : member.fulfillmentRate >= 60
                          ? "text-[#D99E55]"
                          : "text-[#C9604D]"
                    }`}
                  >
                    {member.fulfillmentRate}%
                  </span>
                </div>
              </div>

              {todayRecord?.publishedCount > 0 && (
                <div className="rounded-lg border border-[#6FAA7D]/15 bg-[#6FAA7D]/[0.04] px-2.5 py-1.5 text-[12px] text-[#6FAA7D]">
                  当日已发布 {todayRecord.publishedCount} 条，待确认
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
