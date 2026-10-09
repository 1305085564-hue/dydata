"use client";

import { formatLatency } from "@/lib/ai-config/presentation";

export type ChannelModelTestRow = {
  /** 主标题：模型显示名（渠道级巡检时为渠道名） */
  name: string;
  /** 副信息：model_id / 渠道名，保持等宽弱化 */
  detail?: string | null;
  ok: boolean;
  latencyMs: number | null;
  error?: string | null;
};

/**
 * 模型连通检测结果清单：每个被测对象一行，直接铺开，不折叠。
 * 通过 → 「已通过 + 耗时」；未通过 → 模型名 + 失败原因；原因为空显示「未返回原因」。
 */
export function ChannelModelTestList({ rows }: { rows: ChannelModelTestRow[] }) {
  return (
    <ul className="divide-y divide-[#E2E2DF]/60 rounded-lg border border-[#E2E2DF] bg-white select-text">
      {rows.map((row, index) => {
        const reason = row.error && row.error.trim() ? row.error.trim() : "未返回原因";
        return (
          <li
            key={`${row.name}-${index}`}
            className="flex flex-col gap-1 px-3 py-2 text-[12px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                <span className="text-[13px] font-medium text-[#141413]">{row.name}</span>
                {row.detail && (
                  <span className="font-mono text-[12px] text-[#78716C] break-all">{row.detail}</span>
                )}
              </div>
              {row.ok ? (
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded-md border border-[#6FAA7D]/20 bg-[#6FAA7D]/10 text-[#6FAA7D]">
                    已通过
                  </span>
                  <span className="font-mono text-[#78716C] tabular-nums">
                    {row.latencyMs == null ? "—" : formatLatency(row.latencyMs)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#C0685C]/20 bg-[#C0685C]/10 text-[#C0685C] shrink-0">
                  未通过
                </span>
              )}
            </div>
            {!row.ok && (
              <div className="text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#1F1E1D]">
                <span className="font-medium text-[#78716C]">失败原因：</span>
                {reason}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
