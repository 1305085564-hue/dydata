"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import type { AiModelTestResult } from "../hooks/use-ai-config";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { formatLatency } from "@/lib/ai-config/presentation";

export function modelTestKey(keyId: string, modelId: string) {
  return `${keyId}:${modelId}`;
}

export function getDiagnosticFriendlyWording(diagnostic?: ChannelFailureDiagnostic | null) {
  if (!diagnostic) {
    return {
      headline: "测试未通过",
      ownerLabel: "暂无法判断",
    };
  }

  let headline = "服务商响应异常";
  switch (diagnostic.category) {
    case "model_access":
      headline = "该渠道没有开通这个模型";
      break;
    case "credentials":
      headline = "渠道凭据或鉴权异常";
      break;
    case "quota":
      headline = "渠道额度已耗尽或欠费";
      break;
    case "provider":
      headline = "服务商响应异常（上游服务不可用或超时）";
      break;
    default:
      headline = "渠道响应异常";
      break;
  }

  let ownerLabel = "暂无法判断";
  if (diagnostic.owner === "provider") {
    ownerLabel = "服务商问题";
  } else if (diagnostic.owner === "configuration") {
    ownerLabel = "配置问题";
  }

  return { headline, ownerLabel };
}

export interface ModelTestFeedbackProps {
  result?: AiModelTestResult;
  onDismiss?: () => void;
}

export function ModelTestFeedback({
  result,
}: ModelTestFeedbackProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!result) return null;

  if (result.ok) {
    return (
      <div role="status" className="flex items-center gap-2 py-1 text-[12px] text-[#4B6B4E]">
        <CheckCircle2 className="size-3.5 shrink-0" />
        <span>已恢复能用{result.latencyMs != null ? ` · ${formatLatency(result.latencyMs)}` : ""}</span>
      </div>
    );
  }

  const rawMessage = result.message || "未返回原因";
  const diagnostic = result.failureDiagnostic;
  const { headline, ownerLabel } = getDiagnosticFriendlyWording(diagnostic);
  const requestId = diagnostic?.technical?.requestId;
  const statusCode = diagnostic?.technical?.status;
  const techMessage = diagnostic?.technical?.message || rawMessage;

  return (
    <div
      role="status"
      className="w-full my-2 rounded-xl border border-status-danger/30 bg-status-danger/[0.04] p-3 text-[12px] space-y-2 select-text"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="size-4 shrink-0 text-status-danger" />
          <span className="font-normal text-[14px] text-status-danger-text truncate">
            {headline}
          </span>
          <span className="rounded-md border border-status-danger/20 bg-status-danger/[0.10] px-1.5 py-0.5 text-[12px] text-status-danger-text shrink-0">
            {ownerLabel}
          </span>
        </div>
      </div>

      <div className="text-[12px] text-[#1F1E1D] leading-relaxed break-words whitespace-pre-wrap pl-6">
        {rawMessage}
      </div>

      {/* 技术详情：默认折叠 */}
      <div className="pt-1 pl-6">
        <button
          type="button"
          onClick={() => setShowTechnical(!showTechnical)}
          className="flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] transition-colors"
        >
          {showTechnical ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          <span>技术错误信息</span>
        </button>

        {showTechnical && (
          <div className="mt-2 rounded-xl bg-[#F1F1F0] p-3 font-mono text-[12px] text-[#1F1E1D] space-y-2">
            {statusCode != null && (
              <div className="flex items-center gap-2">
                <span className="text-[#78716C]">HTTP 状态码:</span>
                <span>{statusCode}</span>
              </div>
            )}
            {requestId && (
              <div className="flex items-center justify-between gap-2">
                <div className="truncate">
                  <span className="text-[#78716C]">Request ID: </span>
                  <span>{requestId}</span>
                </div>
                <CopyButton
                  text={requestId}
                  label="复制"
                  copiedLabel="已复制"
                  errorMessage="复制失败，请手动选取"
                  className="shrink-0"
                  iconClassName="size-3"
                />
              </div>
            )}
            <div className="break-all whitespace-pre-wrap text-[12px] text-[#78716C]">
              {techMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
