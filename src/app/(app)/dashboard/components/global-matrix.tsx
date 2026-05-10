"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SopCheckpoint, SopMemberStatus } from "@/types";
import { MATRIX_CHECKPOINTS, STATUS_THEME, matrixRate } from "./status-theme";

interface GlobalMatrixProps {
  rows: SopMemberStatus[];
  onOpenTarget: (memberId: string, checkpoint: SopCheckpoint) => void;
}

/**
 * 全域生产矩阵
 * 法典 V1：单元格 zinc-50 + 左 2px 状态条；无大面积彩底；无 hover:scale
 */
export function GlobalMatrix({ rows, onOpenTarget }: GlobalMatrixProps) {
  const riskCount = rows.filter(
    (row) =>
      row.isOverdue ||
      Object.values(row.statuses).some(
        (status) => status === "REJECTED" || status === "OVERDUE",
      ),
  ).length;

  return (
    <div className="space-y-12">
      <div className="flex flex-col justify-between gap-6 px-2 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.25em] text-[#6FAA7D]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
            <Activity size={12} className="stroke-[1.5]" /> Global Efficiency Index
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">
            全域生产矩阵
          </h2>
        </div>
        <div className="flex items-center gap-5 rounded-2xl border border-zinc-200 bg-white px-8 py-3 shadow-sm">
          <div className="text-center">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              产出率
            </span>
            <span className="text-[20px] font-semibold font-mono tabular-nums text-zinc-800">
              {matrixRate(rows)}%
            </span>
          </div>
          <div className="mx-2 h-8 w-px bg-zinc-200" />
          <div className="text-center">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.25em] text-[#C9604D]">
              风险节点
            </span>
            <span className="text-[20px] font-semibold font-mono tabular-nums text-[#C9604D]">
              {String(riskCount).padStart(2, "0")}
            </span>
          </div>
          <button className="ml-4 rounded-[10px] border border-zinc-200 bg-white p-2 text-zinc-500 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5">
            <Filter size={16} className="stroke-[1.5]" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <th className="sticky left-0 z-20 border-r border-zinc-100 bg-zinc-50 p-8 text-[10px] font-medium uppercase tracking-[0.25em]">
                  Influencer
                </th>
                {MATRIX_CHECKPOINTS.map((cp) => (
                  <th
                    key={cp.id}
                    className="border-r border-zinc-100 p-8 text-center text-[10px] font-medium uppercase tracking-[0.25em]"
                  >
                    {cp.label}
                  </th>
                ))}
                <th className="p-8 text-right text-[10px] font-medium uppercase tracking-[0.25em]">
                  Metrics
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const hasRisk =
                  row.isOverdue ||
                  Object.values(row.statuses).some(
                    (status) => status === "REJECTED" || status === "OVERDUE",
                  );
                const approvedCount = MATRIX_CHECKPOINTS.filter(
                  (checkpoint) => row.statuses[checkpoint.id] === "APPROVED",
                ).length;
                return (
                  <tr
                    key={row.userId}
                    className="group border-b border-zinc-50 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] last:border-none hover:bg-zinc-50"
                  >
                    <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white p-8 group-hover:bg-zinc-50">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            hasRisk ? "bg-[#C9604D]" : "bg-[#6FAA7D]",
                          )}
                        />
                        <span className="text-[14px] font-semibold tracking-tight text-zinc-800">
                          {row.userName || `达人 ${idx + 1}`}
                        </span>
                      </div>
                    </td>
                    {MATRIX_CHECKPOINTS.map((checkpoint) => {
                      const status = row.statuses[checkpoint.id];
                      const theme = STATUS_THEME[status];
                      const Icon =
                        status === "APPROVED"
                          ? CheckCircle2
                          : status === "REJECTED" || status === "OVERDUE"
                            ? AlertCircle
                            : status === "SUBMITTED" || status === "PENDING"
                              ? Activity
                              : null;
                      return (
                        <td key={checkpoint.id} className="border-r border-zinc-50 p-4">
                          <div className="flex justify-center">
                            <button
                              onClick={() => onOpenTarget(row.userId, checkpoint.id)}
                              className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 border-l-[2px] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-100 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5",
                                theme.cellBar,
                                theme.color,
                              )}
                            >
                              {Icon ? (
                                <Icon size={16} className="stroke-[1.5]" />
                              ) : (
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                              )}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-8 text-right font-semibold font-mono tabular-nums text-zinc-800">
                      {approvedCount}.{row.submissions.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
