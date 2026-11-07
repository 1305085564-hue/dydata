"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  ArrowDown,
  Play,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { AvailabilityChannel } from "@/lib/ai-config/availability";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { formatSleepCountdown, AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

const REVEAL_ON_HOVER = "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 transition-opacity duration-150";

export interface ModelChannelRowProps {
  channel: AvailabilityChannel;
  modelId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onToggleEnabled: (keyModelId: string, enabled: boolean) => Promise<void>;
  onRename: (keyModelId: string, newName: string) => Promise<void>;
  onTest: (keyId: string, modelId: string) => Promise<void>;
  onDeleteSupply: (keyModelId: string) => Promise<void>;
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  isTesting?: boolean;
}

export function ModelChannelRow({
  channel,
  modelId,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleEnabled,
  onRename,
  onTest,
  onDeleteSupply,
  failureDiagnostic,
  isTesting = false,
}: ModelChannelRowProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const isEnabled = channel.identity !== "disabled";
  const isInvalid = channel.identity === "invalid";
  const isSleeping = channel.identity === "sleeping";
  const isUsable = channel.identity === "active" || channel.identity === "retest";
  const moveLockReason = !channel.isSchedulable
    ? isSleeping
      ? "休眠期间顺位锁定，恢复后可调整"
      : "该渠道当前不可调度，不能调整顺位"
    : null;
  const moveUpTitle = canMoveUp ? "上移顺位" : moveLockReason ?? "没有可交换的可用渠道";
  const moveDownTitle = canMoveDown ? "下移顺位" : moveLockReason ?? "没有可交换的可用渠道";

  const handleStartRename = () => {
    setEditingNameValue(channel.label || "");
    setIsEditingName(true);
  };

  const handleSaveRename = async () => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) {
      feedbackToast.error("名称不能为空");
      return;
    }
    await onRename(channel.keyModelId, trimmed);
    setIsEditingName(false);
  };

  const handleCopyRequestId = async (requestId: string) => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      feedbackToast.success("已复制 Request ID");
    } catch {
      feedbackToast.error("复制失败");
    }
  };

  return (
    <div
      data-slot="ai-channel-row"
      className={cn(
        "group px-4 py-2 text-[12px] transition-colors",
        !isInvalid && "md:h-10",
        !isEnabled
          ? "bg-[#F7F7F6]/60 opacity-70"
          : isInvalid
          ? "bg-status-danger/[0.04]"
          : "bg-white hover:bg-[#F7F7F6]"
      )}
    >
      <div className="flex flex-wrap items-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_200px_112px] md:gap-3">
        {/* 左侧：顺位移动、渠道信息与供应改名 */}
        <div className="flex items-center gap-2 min-w-0">
          {/* 顺位上移/下移 */}
          <div className={cn("flex items-center gap-1 shrink-0", REVEAL_ON_HOVER)}>
            <Button
              variant="ghost"
              size="icon-s"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              className="size-6 text-[#78716C] hover:text-[#141413] disabled:opacity-30"
              title={moveUpTitle}
              aria-label={moveUpTitle}
            >
              <ArrowUp className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-s"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              className="size-6 text-[#78716C] hover:text-[#141413] disabled:opacity-30"
              title={moveDownTitle}
              aria-label={moveDownTitle}
            >
              <ArrowDown className="size-3" />
            </Button>
          </div>

          {/* 渠道名称与接入点 */}
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  className="h-7 text-[12px] border-[#E2E2DF] max-w-[200px]"
                  placeholder="渠道显示名"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={handleSaveRename}
                  className="size-6 text-[#4B6B4E]"
                  title="保存"
                  aria-label="保存"
                >
                  <Check className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={() => setIsEditingName(false)}
                  className="size-6 text-[#78716C]"
                  title="取消"
                  aria-label="取消"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-normal text-[13px] text-[#141413] truncate">
                  {channel.label || channel.providerName}
                </span>
                <span className="text-[12px] text-[#78716C] shrink-0">
                  ({channel.providerName})
                </span>
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={handleStartRename}
                  className={cn("size-5 text-[#A8A29E] hover:text-[#141413]", REVEAL_ON_HOVER)}
                  title="修改渠道供应名称"
                  aria-label="修改渠道供应名称"
                >
                  <Edit2 className="size-2.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 中间：口径 5 的四种状态 */}
        <div data-slot="ai-channel-status" className="flex items-center gap-2 shrink-0 md:justify-start">
          {isUsable && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#4B6B4E]/10 px-2 py-0.5 text-[12px] text-[#4B6B4E]">
              <span className="size-1.5 rounded-full bg-[#4B6B4E]" />
              {AI_CONFIG_MESSAGES["channel.usable"]}
            </span>
          )}

          {isSleeping && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C]">
              <Clock className="size-3" />
              {AI_CONFIG_MESSAGES["channel.cooling"]} · {formatSleepCountdown(channel.sleepUntil)}
            </span>
          )}

          {isInvalid && (
            <span className="inline-flex items-center gap-1 rounded-md bg-status-danger/[0.10] px-2 py-0.5 text-[12px] text-status-danger-text">
              <AlertCircle className="size-3" />
              {AI_CONFIG_MESSAGES["channel.action_required"]}
            </span>
          )}

          {!isEnabled && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C]">
              {AI_CONFIG_MESSAGES["channel.disabled"]}
            </span>
          )}
        </div>

        {/* 右侧：单供应开关、测试、删除供应 */}
        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          {/* 单条测试 */}
          <span className={cn("inline-flex", !isTesting && REVEAL_ON_HOVER)}>
            <Button
              variant="ghost"
              size="icon-s"
              disabled={isTesting || !isEnabled}
              onClick={() => onTest(channel.keyId, modelId)}
              className="size-6 text-[#78716C] hover:text-[#141413] disabled:opacity-30"
              title="测试此渠道该模型供应"
              aria-label="测试此渠道该模型供应"
            >
              <Play className={cn("size-3", isTesting && "animate-spin")} />
            </Button>
          </span>

          {/* 陷阱 A: 仅控制此供应的开关，传 keyModelId */}
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => onToggleEnabled(channel.keyModelId, checked)}
            aria-label="是否启用渠道"
          />

          {/* 删除此供应 */}
          <Button
            variant="ghost"
            size="icon-s"
            onClick={() => onDeleteSupply(channel.keyModelId)}
            className={cn("size-6 text-[#A8A29E] hover:text-status-danger", REVEAL_ON_HOVER)}
            title="移除此模型在此渠道的供应"
            aria-label="移除此模型在此渠道的供应"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* 需要你处理：展示原因（在主列表里显眼，不折叠原因），技术详情可折叠 */}
      {isInvalid && (
        <div className="pt-1 text-[12px] space-y-1 md:pl-15">
          <div className="text-status-danger-text">
            原因：{failureDiagnostic?.technical?.message || "渠道连通性异常或鉴权失败"}
          </div>

          {failureDiagnostic && (
            <div>
              <button
                type="button"
                onClick={() => setShowTechnical(!showTechnical)}
                className="flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413]"
              >
                {showTechnical ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                <span>技术详情</span>
              </button>
              {showTechnical && (
                <div className="mt-1 rounded-md bg-[#F1F1F0] p-2 font-mono text-[12px] text-[#1F1E1D] space-y-1">
                  <div>分类: {failureDiagnostic.category}</div>
                  <div>责任方: {failureDiagnostic.owner}</div>
                  {failureDiagnostic.technical?.requestId && (
                    <div className="flex items-center justify-between">
                      <span>Request ID: {failureDiagnostic.technical.requestId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyRequestId(failureDiagnostic.technical.requestId!)}
                        className="text-[12px] text-[#78716C] hover:text-[#141413]"
                      >
                        {copiedId ? "已复制" : "复制"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
