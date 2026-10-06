"use client";

import { useEffect, useState } from "react";
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
  RefreshCw,
} from "lucide-react";
import { useAiConfig, type AiProviderKey } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { Button } from "@/components/ui/button";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { feedbackToast } from "@/components/ui/feedback-toast";
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
  pendingDeletionRemaining?: Map<string, number>;
  isShelved?: boolean;
  onRenameModel?: (modelId: string, modelRecordId: string, newDisplayName: string) => Promise<boolean>;
  onTestKey: (keyId: string, modelId: string) => Promise<void>;
  onSyncKeyModels: (key: AiProviderKey) => Promise<void>;
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
  pendingDeletionRemaining,
  isShelved = true,
  onRenameModel,
  onTestKey,
  onSyncKeyModels,
  onEditKey,
  onDeleteKeyWithCheck,
  onUndoDeleteKey,
  onAddChannelForModel,
  onSwapPriority,
}: ModelFamilyCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);


  // F2: 行内编辑名称状态
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);

  useEffect(() => {
    setCurrentDisplayName(displayName);
    setNameInput(displayName);
  }, [displayName]);

  const activeChannelCount = report?.modelFamilies.find((family) => family.modelId === modelId)?.schedulableChannelCount ?? 0;

  const handleTest = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      await onTestKey(keyId, modelId);
    } finally {
      setTestingKeyId(null);
    }
  };

  const isHighlighted = highlightedModelIds.includes(modelId);

  // F2: 行内改名提交与取消
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentDisplayName) {
      setEditingName(false);
      return;
    }
    const previous = currentDisplayName;
    // 乐观更新
    setCurrentDisplayName(trimmed);
    setEditingName(false);

    if (onRenameModel && items[0]?.modelRecordId) {
      const ok = await onRenameModel(modelId, items[0].modelRecordId, trimmed);
      if (!ok) {
        setCurrentDisplayName(previous);
        setNameInput(previous);
        feedbackToast.error("修改模型名称失败，已回滚");
      } else {
        feedbackToast.success("已更新模型显示名称");
      }
    }
  };

  const handleCancelName = () => {
    setNameInput(currentDisplayName);
    setEditingName(false);
  };

  return (
    <div
      data-model-id={modelId}
      className={cn(
        "rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input transition-all duration-300",
        !isShelved && "opacity-75 bg-[#FAFAFA]",
        isHighlighted && "ring-2 ring-[#D97757]/30"
      )}
    >
      {/* 父级：模型定名标题行（展示下沉气垫） */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`model-family-${modelId}`}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#FCFCFB] border-b border-[#E2E2DF]/60 hover:bg-[#F7F7F6] cursor-pointer select-none transition-colors"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {expanded ? (
            <ChevronDown className="size-3.5 text-[#78716C] shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 text-[#78716C] shrink-0" />
          )}

          {/* F2: 模型名与行内改名 */}
          {editingName ? (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") handleCancelName();
                }}
                autoFocus
                className="h-6 px-1.5 text-[13px] font-medium border border-[#D97757] rounded-md bg-white text-[#141413] focus:outline-none"
              />
              <Button
                variant="ghost"
                size="s"
                onClick={handleSaveName}
                className="h-6 text-[12px] px-1.5 text-[#141413]"
              >
                保存
              </Button>
              <Button
                variant="ghost"
                size="s"
                onClick={handleCancelName}
                className="h-6 text-[12px] px-1.5 text-[#78716C]"
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[14px] font-medium text-[#141413] truncate">
                {currentDisplayName}
              </span>
              {/* 铅笔微符（图标 14px，热区 ≥ 24px） */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingName(true);
                  setNameInput(currentDisplayName);
                }}
                className="size-6 flex items-center justify-center rounded-md hover:bg-[#EBEBE9] text-[#78716C] hover:text-[#141413] transition-colors shrink-0"
                title="修改模型显示名称"
              >
                <Pencil className="size-3" />
              </button>
            </div>
          )}

          {currentDisplayName !== modelId && !editingName && (
            <span className="text-[12px] font-mono text-[#78716C] truncate">
              ({modelId})
            </span>
          )}

          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[12px] shrink-0",
              isShelved
                ? "bg-[#F1F1F0] text-[#78716C]"
                : "bg-[#C0685C]/10 text-[#C0685C]"
            )}
          >
            {isShelved ? `${activeChannelCount} 个密钥就绪` : "已下架"}
          </span>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="s"
            className="h-6.5 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] px-2 font-normal"
            onClick={() => onAddChannelForModel(modelId)}
          >
            <Plus className="size-3 mr-1" />
            为此模型添加接入渠道
          </Button>
        </div>
      </div>

      {/* 子级：展开的渠道与密钥阶梯明细（白纸排版 + 明确缩进） */}
      {expanded && (
        <div id={`model-family-${modelId}`} className="divide-y divide-[#E2E2DF]/60 bg-white">
          {items.length === 0 ? (
            <div className="py-4 pl-8 text-left text-[12px] text-[#A8A29E]">
              暂未绑定可用渠道密钥，可点击右上角「为此模型添加接入渠道」。
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
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-7 sm:pl-8 pr-3.5 py-2.5 transition-colors",
                    isPending
                      ? "opacity-50 pointer-events-none bg-[#F5F5F4]"
                      : key.is_enabled
                      ? "hover:bg-[#FCFCFB]"
                      : "bg-[#FAFAFA] text-[#A8A29E]"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C]">
                      P{key.priority}
                    </span>
                    {key.is_enabled ? (
                      <Zap className="size-3 text-[#D97757] fill-[#D97757]" />
                    ) : (
                      <Pause className="size-3 text-[#A8A29E]" />
                    )}
                    <span className="text-[13px] font-normal text-[#1F1E1D]" title={key.api_key_masked ? `密钥 ${key.api_key_masked}` : undefined}>
                      {item.providerName} · {key.label}
                    </span>

                    <span className="text-[#E2E2DF]">·</span>

                    {health === "healthy" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[#6FAA7D]">
                        <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                        健康
                      </span>
                    ) : health === "unhealthy" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[#C0685C]">
                        <span className="size-1.5 rounded-full bg-[#C0685C]" />
                        故障
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[#78716C]">
                        <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                        待命中
                      </span>
                    )}
                  </div>

                  {/* 操作按钮组 */}
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    {isPending ? (
                      <Button
                        variant="outline"
                        size="s"
                        onClick={() => onUndoDeleteKey(key.id)}
                        className="h-6.5 text-[12px] border-[#D97757] text-[#D97757] pointer-events-auto"
                      >
                        <RotateCcw className="size-3 mr-1" />
                        {pendingDeletionRemaining?.has(key.id)
                          ? `撤回删除 (${pendingDeletionRemaining.get(key.id)}s)`
                          : "撤回删除"}
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
                          className="size-6 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title="提高优先级（上移）"
                        >
                          <ArrowUp className="size-3" />
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
                          className="size-6 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title="降低优先级（下移）"
                        >
                          <ArrowDown className="size-3" />
                        </Button>

                        <Button
                          variant="outline"
                          size="s"
                          disabled={isTesting}
                          onClick={() => handleTest(key.id)}
                          className="h-6.5 text-[12px] px-2 border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        >
                          {isTesting ? (
                            <Loader2 className="size-3 animate-spin mr-1 text-[#D97757]" />
                          ) : (
                            <Play className="size-3 text-[#D97757] mr-1" />
                          )}
                          测试连通
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void onSyncKeyModels(key)} className="size-6 text-[#78716C] hover:text-[#1F1E1D]" title="重新探测上游模型并勾选">
                          <RefreshCw className="size-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditKey(key)}
                          className="size-6 text-[#78716C] hover:text-[#1F1E1D]"
                          title="编辑密钥"
                        >
                          <Pencil className="size-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteKeyWithCheck(key.id)}
                          className="size-6 text-[#78716C] hover:text-[#C0685C]"
                          title="删除密钥"
                        >
                          <Trash2 className="size-3" />
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
