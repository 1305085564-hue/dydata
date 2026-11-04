"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, AlertTriangle, Moon, CheckCircle2 } from "lucide-react";
import type { AiModelTestResult } from "../hooks/use-ai-config";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { formatLatency } from "@/lib/ai-config/presentation";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";

export function modelTestKey(keyId: string, modelId: string) {
  return `${keyId}:${modelId}`;
}

export function getDiagnosticFriendlyWording(diagnostic?: ChannelFailureDiagnostic | null) {
  if (!diagnostic) {
    return {
      headline: "渠道测试未通过",
      ownerLabel: "暂无法判断",
      ownerBadgeColor: "bg-[#F1F1F0] text-[#78716C] border-[#E2E2DF]",
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
  let ownerBadgeColor = "bg-[#F1F1F0] text-[#78716C] border-[#E2E2DF]";
  if (diagnostic.owner === "provider") {
    ownerLabel = "服务商问题";
    ownerBadgeColor = "bg-[#8A6A2F]/10 text-[#8A6A2F] border-[#8A6A2F]/20";
  } else if (diagnostic.owner === "configuration") {
    ownerLabel = "我方配置问题";
    ownerBadgeColor = "bg-status-danger-bg text-status-danger-text border-status-danger/20";
  }

  return { headline, ownerLabel, ownerBadgeColor };
}

export interface ModelTestFeedbackProps {
  result?: AiModelTestResult;
  keyId?: string;
  onSleepKey?: (keyId: string) => Promise<void>;
  onDismiss?: () => void;
}

export function ModelTestFeedback({
  result,
  keyId,
  onSleepKey,
  onDismiss,
}: ModelTestFeedbackProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);

  if (!result) return null;

  if (result.ok) {
    return (
      <span role="status" className="flex items-center gap-1.5 py-1 text-[12px] text-[#4B6B4E]">
        <CheckCircle2 className="size-3.5 shrink-0" />
        <span>本次测试通过{result.latencyMs != null ? ` · ${formatLatency(result.latencyMs)}` : ""}</span>
      </span>
    );
  }

  const rawMessage = result.message || "未返回原因";
  const diagnostic = result.failureDiagnostic;
  const { headline, ownerLabel, ownerBadgeColor } = getDiagnosticFriendlyWording(diagnostic);
  const requestId = diagnostic?.technical?.requestId;
  const statusCode = diagnostic?.technical?.status;
  const techMessage = diagnostic?.technical?.message || rawMessage;

  const handleCopyRequestId = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      feedbackToast.success("已复制请求编号 (Request ID)");
    } catch {
      feedbackToast.error("复制失败，请手动选取");
    }
  };

  const handleSleepClick = async () => {
    if (!keyId || !onSleepKey) return;
    setIsSleeping(true);
    try {
      await onSleepKey(keyId);
      feedbackToast.success("已将此渠道临时休眠 30 分钟，调度已暂停");
      onDismiss?.();
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "临时休眠操作失败");
    } finally {
      setIsSleeping(false);
    }
  };

  return (
    <div
      role="status"
      className="w-full my-2 rounded-lg border border-status-danger/25 bg-status-danger/[0.04] p-3 text-[12px] space-y-2"
    >
      {/* 头部：人话标题 + 归属标签 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="size-3.5 text-status-danger shrink-0" />
          <span className="font-normal text-ink-body truncate">
            本次测试未通过 · {headline}
          </span>
        </div>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border font-normal ${ownerBadgeColor}`}>
          {ownerLabel}
        </span>
      </div>

      {/* 仅在 diagnostic 缺失时主体展示原始报错兜底，有 diagnostic 时收进折叠区 */}
      {!diagnostic && (
        <div className="text-[12px] text-status-danger-text break-words">
          {rawMessage}
        </div>
      )}

      {/* 处置操作按钮组：主按钮临时休眠，次按钮仅记录 */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {keyId && onSleepKey && (
          <Button
            type="button"
            variant="outline"
            size="s"
            disabled={isSleeping}
            onClick={handleSleepClick}
            className="h-6.5 px-2.5 text-[12px] bg-white border-[#E2E2DF] text-[#141413] hover:bg-[#F1F1F0] shadow-input font-normal gap-1"
          >
            <Moon className="size-3 text-[#78716C]" />
            <span>{isSleeping ? "正在休眠…" : "临时休眠 30 分钟"}</span>
          </Button>
        )}
        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="s"
            onClick={onDismiss}
            className="h-6.5 px-2 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
          >
            仅记录（不改变调度）
          </Button>
        )}

        <button
          type="button"
          onClick={() => setShowTechnical(!showTechnical)}
          className="ml-auto inline-flex items-center gap-0.5 text-[12px] text-[#78716C] hover:text-[#141413] cursor-pointer"
        >
          {showTechnical ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <span>{showTechnical ? "收起技术详情" : "查看技术详情"}</span>
        </button>
      </div>

      {/* 折叠的技术详情 */}
      {showTechnical && (
        <div className="rounded-md border border-[#E2E2DF] bg-white p-2.5 text-[12px] font-mono text-[#78716C] space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DF]/60 pb-1">
            <span>状态码：{statusCode ? `HTTP ${statusCode}` : "无"}</span>
            {requestId && (
              <div className="flex items-center gap-1">
                <span className="truncate max-w-[200px]" title={requestId}>
                  Request ID: {requestId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyRequestId}
                  className="size-5 inline-flex items-center justify-center rounded hover:bg-[#F1F1F0] text-[#78716C] hover:text-[#141413]"
                  title="复制请求 ID"
                >
                  {copiedId ? <Check className="size-3 text-[#4B6B4E]" /> : <Copy className="size-3" />}
                </button>
              </div>
            )}
          </div>
          <div className="break-all whitespace-pre-wrap text-[11px] text-[#1F1E1D]/90 max-h-32 overflow-y-auto">
            {techMessage}
          </div>
        </div>
      )}
    </div>
  );
}
