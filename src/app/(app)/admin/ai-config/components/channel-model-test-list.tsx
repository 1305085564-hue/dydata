"use client";

import { useState } from "react";
import { formatLatency } from "@/lib/ai-config/presentation";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";

export interface CheckResultItem {
  keyId?: string;
  modelId?: string;
  ok: boolean;
  latencyMs?: number | null;
  message?: string | null;
  channelLabel?: string;
  channelName?: string;
  model?: string;
  modelDisplayName?: string;
  failureDiagnostic?: {
    category: string;
    owner: string;
    technical?: {
      message?: string;
      status?: number;
      requestId?: string;
    };
  };
}

export interface CheckSummaryProps {
  checkResult: {
    total: number;
    successCount: number;
    failureCount: number;
    results: CheckResultItem[];
  } | null;
  onDismiss?: () => void;
}

export function LastCheckSummaryCard({ checkResult, onDismiss }: CheckSummaryProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!checkResult) return null;

  const { total, successCount, failureCount, results } = checkResult;

  if (total === 0) {
    return (
      <div className="rounded-xl border border-[#E2E2DF] bg-[#F7F7F6] p-4 text-[12px] text-[#78716C] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>现在没有需要检查的对象</span>
          <span className="text-[#A8A29E]">（只查已启用业务选中的模型和全局默认打开的供应）</span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[12px] text-[#78716C] hover:text-[#141413]"
          >
            收起
          </button>
        )}
      </div>
    );
  }

  const failures = results.filter((r) => !r.ok);

  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white p-4 space-y-3 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-normal text-[14px] text-[#141413]">最近一次检查结果</span>
          <span className="text-[12px] text-[#78716C]">
            共查 {total} 组，{successCount} 组通过，{failureCount} 组失败
          </span>
          {failureCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-status-danger/[0.10] px-2 py-0.5 text-[12px] text-status-danger-text">
              <AlertCircle className="size-3 shrink-0" />
              发现问题
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#4B6B4E]/10 px-2 py-0.5 text-[12px] text-[#4B6B4E]">
              <CheckCircle2 className="size-3 shrink-0" />
              全部正常
            </span>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[12px] text-[#78716C] hover:text-[#141413]"
          >
            收起
          </button>
        )}
      </div>

      {failures.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-[#E2E2DF]/60">
          <div className="text-[12px] text-[#78716C]">失败对象明细：</div>
          <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] overflow-hidden">
            {failures.map((item, idx) => {
              const channelTitle = item.channelLabel || item.channelName || item.keyId || "未知渠道";
              const modelTitle = item.modelDisplayName || item.model || item.modelId || "未知模型";
              const isExpanded = expandedIndex === idx;

              return (
                <div key={idx} className="p-3 text-[12px] space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-normal text-[#141413] text-[13px]">{channelTitle}</span>
                      <span className="text-[#78716C]">·</span>
                      <span className="font-mono text-[#1F1E1D]">{modelTitle}</span>
                    </div>
                    <span className="rounded-md border border-status-danger/20 bg-status-danger/[0.10] px-1.5 py-0.5 text-[12px] text-status-danger-text">
                      失败
                    </span>
                  </div>

                  <div className="text-[12px] text-status-danger-text pt-0.5">
                    {item.message || "未返回失败原因"}
                  </div>

                  {item.failureDiagnostic && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                        className="flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413]"
                      >
                        {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        <span>诊断与技术信息</span>
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 rounded-md bg-[#F1F1F0] p-2 font-mono text-[12px] text-[#1F1E1D] space-y-1">
                          <div>分类: {item.failureDiagnostic.category}</div>
                          <div>归属: {item.failureDiagnostic.owner}</div>
                          {item.failureDiagnostic.technical?.status != null && (
                            <div>状态码: {item.failureDiagnostic.technical.status}</div>
                          )}
                          {item.failureDiagnostic.technical?.message && (
                            <div className="break-all whitespace-pre-wrap">
                              报错: {item.failureDiagnostic.technical.message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type ChannelModelTestRow = {
  name: string;
  detail?: string | null;
  ok: boolean;
  latencyMs: number | null;
  error?: string | null;
};

export function ChannelModelTestList({ rows }: { rows: ChannelModelTestRow[] }) {
  return (
    <ul className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white select-text">
      {rows.map((row, index) => {
        const reason = row.error && row.error.trim() ? row.error.trim() : "未返回原因";
        return (
          <li
            key={`${row.name}-${index}`}
            className="flex flex-col gap-1 px-3 py-2 text-[12px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                <span className="text-[14px] text-[#141413]">{row.name}</span>
                {row.detail && (
                  <span className="font-mono text-[12px] text-[#78716C] break-all">{row.detail}</span>
                )}
              </div>
              {row.ok ? (
                <span className="inline-flex items-center gap-2 shrink-0">
                  <span className="px-1.5 py-0.5 rounded-md border border-[#4B6B4E]/20 bg-[#4B6B4E]/10 text-[#4B6B4E]">
                    已恢复能用
                  </span>
                  <span className="font-mono text-[#78716C] tabular-nums">
                    {row.latencyMs == null ? "—" : formatLatency(row.latencyMs)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-status-danger/20 bg-status-danger/[0.10] text-status-danger-text shrink-0">
                  未通过
                </span>
              )}
            </div>
            {!row.ok && (
              <div className="text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#1F1E1D]">
                <span className="text-[#78716C]">失败原因：</span>
                {reason}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
