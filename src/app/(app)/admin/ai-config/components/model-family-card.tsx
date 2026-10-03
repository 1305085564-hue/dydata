"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Pause,
  Plus,
  Play,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { type AiProviderKey } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { cn } from "@/lib/utils";

export type ModelFamilyKeyItem = {
  key: AiProviderKey;
  providerName: string;
  modelRecordId: string;
  modelId: string;
  displayName: string;
};

interface ModelFamilyCardProps {
  modelId: string;
  displayName: string;
  items: ModelFamilyKeyItem[];
  highlightedModelIds?: string[];
  pendingDeletionKeys: Set<string>;
  onTestKey: (keyId: string, modelId: string) => Promise<void>;
  onEditKey: (key: AiProviderKey) => void;
  onDeleteKeyWithCheck: (keyId: string) => void;
  onUndoDeleteKey: (keyId: string) => void;
  onAddChannelForModel: (modelId: string) => void;
  onSwapPriority: (keyId: string, targetKeyId: string, p1: number, p2: number) => Promise<void>;
}

export function ModelFamilyCard({
  modelId,
  displayName,
  items,
  highlightedModelIds = [],
  pendingDeletionKeys,
  onTestKey,
  onEditKey,
  onDeleteKeyWithCheck,
  onUndoDeleteKey,
  onAddChannelForModel,
  onSwapPriority,
}: ModelFamilyCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  const activeChannelCount = items.filter((it) => it.key.is_enabled).length;

  const handleTest = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      await onTestKey(keyId, modelId);
    } finally {
      setTestingKeyId(null);
    }
  };

  const isHighlighted = highlightedModelIds.includes(modelId);

  return (
    <div
      data-model-id={modelId}
      className={cn(
        "rounded-xl border border-[#E2E2DF] bg-white transition-all overflow-hidden",
        isHighlighted && "animate-highlight ring-2 ring-[#D97757]/30"
      )}
    >
      {/* 折叠标题行 */}
      <div
        className="flex items-center justify-between p-3.5 bg-[#FCFCFB] hover:bg-[#F5F5F4]/60 cursor-pointer select-none transition-colors border-b border-[#E2E2DF]/60"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 text-[#78716C]" />
          ) : (
            <ChevronRight className="size-4 text-[#78716C]" />
          )}
          <span className="text-[14px] font-medium text-[#1F1E1D]">
            {displayName}
          </span>
          <span className="text-[12px] font-normal text-[#78716C]">
            ({activeChannelCount} 个可用渠道)
          </span>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="s"
            className="h-7 text-[12px] text-[#D97757] hover:bg-[#D97757]/10"
            onClick={() => onAddChannelForModel(modelId)}
          >
            <Plus className="size-3.5 mr-1" />
            为此模型添加接入渠道
          </Button>
        </div>
      </div>

      {/* 展开的渠道与密钥阶梯 */}
      {expanded && (
        <div className="p-3 space-y-2">
          {items.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[#78716C]">
              暂未绑定可用渠道密钥，请点击右上角添加。
            </div>
          ) : (
            items.map((item, index) => {
              const key = item.key;
              const isPending = pendingDeletionKeys.has(key.id);
              const isTesting = testingKeyId === key.id;

              const health = getProviderKeyHealthStatus({
                isEnabled: key.is_enabled,
                lastSuccessAt: key.last_success_at,
                lastFailureAt: key.last_failure_at,
                unhealthyUntil: key.unhealthy_until,
              });

              const isFirst = index === 0;
              const isLast = index === items.length - 1;

              return (
                <div
                  key={key.id}
                  data-key-id={key.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all",
                    isPending
                      ? "opacity-50 pointer-events-none bg-[#F5F5F4] border-[#E2E2DF]"
                      : key.is_enabled
                      ? "border-[#E2E2DF] bg-white hover:border-[#D97757]/40"
                      : "border-[#E2E2DF]/60 bg-[#FAFAFA] text-[#A8A29E]"
                  )}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-mono text-[#78716C]">
                        {index + 1}.
                      </span>
                      {key.is_enabled ? (
                        <Zap className="size-3.5 text-[#D97757] fill-[#D97757]" />
                      ) : (
                        <Pause className="size-3.5 text-[#A8A29E]" />
                      )}
                      <span className="text-[13px] font-medium text-[#1F1E1D]">
                        {item.providerName}
                      </span>
                      <span className="text-[12px] text-[#78716C]">
                        ({key.label})
                      </span>
                      {key.api_key_masked && (
                        <span className="text-[11px] font-mono text-[#A8A29E] bg-[#F1F1F0] px-1.5 py-0.2 rounded">
                          {key.api_key_masked}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#78716C]">
                      <span>顺位优先级 P{key.priority}</span>
                      <span>·</span>
                      {health === "healthy" ? (
                        <span className="inline-flex items-center gap-1 text-[#10B981]">
                          <span className="size-1.5 rounded-full bg-[#10B981]" />
                          健康
                        </span>
                      ) : health === "unhealthy" ? (
                        <span className="inline-flex items-center gap-1 text-status-danger">
                          <span className="size-1.5 rounded-full bg-status-danger" />
                          故障
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#78716C]">
                          <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                          待命中
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮组 */}
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    {isPending ? (
                      <Button
                        variant="outline"
                        size="s"
                        onClick={() => onUndoDeleteKey(key.id)}
                        className="h-7 text-[12px] border-[#D97757] text-[#D97757] pointer-events-auto"
                      >
                        <RotateCcw className="size-3 mr-1" />
                        撤回删除 (5s)
                      </Button>
                    ) : (
                      <>
                        {/* 顺位上移/下移 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isFirst}
                          onClick={() => {
                            const prev = items[index - 1];
                            if (prev) {
                              onSwapPriority(key.id, prev.key.id, key.priority, prev.key.priority);
                            }
                          }}
                          className="size-7 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title="提高优先级（上移）"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isLast}
                          onClick={() => {
                            const next = items[index + 1];
                            if (next) {
                              onSwapPriority(key.id, next.key.id, key.priority, next.key.priority);
                            }
                          }}
                          className="size-7 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title="降低优先级（下移）"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>

                        <Button
                          variant="outline"
                          size="s"
                          disabled={isTesting}
                          onClick={() => handleTest(key.id)}
                          className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        >
                          {isTesting ? (
                            <Loader2 className="size-3 animate-spin mr-1 text-[#D97757]" />
                          ) : (
                            <Play className="size-3 text-[#D97757] mr-1" />
                          )}
                          测试连通
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditKey(key)}
                          className="size-7 text-[#78716C] hover:text-[#1F1E1D]"
                          title="编辑密钥"
                        >
                          <Pencil className="size-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteKeyWithCheck(key.id)}
                          className="size-7 text-[#78716C] hover:text-status-danger"
                          title="删除密钥"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
