"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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
import { Switch } from "@/components/ui/switch";
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
  onRenameKey?: (keyId: string, newLabel: string) => Promise<boolean>;
  onToggleModelShelf?: (modelId: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  onToggleKeyEnable?: (keyId: string, enabled: boolean) => Promise<boolean>;
  onTestKey: (keyId: string, modelId: string) => Promise<void>;
  onTestKeyAllModels?: (keyId: string) => Promise<unknown>;
  onSyncKeyModels: (key: AiProviderKey) => Promise<void>;
  onDeleteKeyWithCheck: (keyId: string) => void;
  onUndoDeleteKey: (keyId: string) => void;
  onAddChannelForModel: (modelId: string) => void;
  onSwapPriority: (keyId: string, targetKeyId: string, p1: number, p2: number) => Promise<void>;
}

function formatSimpleTime(isoString?: string | null): string | null {
  if (!isoString) return null;
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return null;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  return `${Math.floor(diffSec / 86400)}天前`;
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
  onRenameKey,
  onToggleModelShelf,
  onToggleKeyEnable,
  onTestKey,
  onTestKeyAllModels,
  onSyncKeyModels,
  onDeleteKeyWithCheck,
  onUndoDeleteKey,
  onAddChannelForModel,
  onSwapPriority,
}: ModelFamilyCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  // 模型名编辑状态
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);

  // 渠道名就地编辑状态
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [keyLabelInput, setKeyLabelInput] = useState("");
  const [savingKeyId, setSavingKeyId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentDisplayName(displayName);
    setNameInput(displayName);
  }, [displayName]);

  const healthyChannelCount = items.filter((it) => {
    return (
      getProviderKeyHealthStatus({
        isEnabled: it.key.is_enabled,
        lastSuccessAt: it.key.last_success_at,
        lastFailureAt: it.key.last_failure_at,
        unhealthyUntil: it.key.unhealthy_until,
      }) === "healthy"
    );
  }).length;

  const handleTest = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      await onTestKey(keyId, modelId);
    } finally {
      setTestingKeyId(null);
    }
  };

  const isHighlighted = highlightedModelIds.includes(modelId);

  // 模型重命名
  const handleSaveModelName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentDisplayName) {
      setEditingName(false);
      return;
    }
    const previous = currentDisplayName;
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

  const handleCancelModelName = () => {
    setNameInput(currentDisplayName);
    setEditingName(false);
  };

  // 渠道重命名
  const handleStartRenameKey = (keyId: string, currentLabel: string) => {
    setEditingKeyId(keyId);
    setKeyLabelInput(currentLabel);
  };

  const handleSaveKeyName = async (keyId: string) => {
    const trimmed = keyLabelInput.trim();
    if (!trimmed) {
      feedbackToast.error("渠道显示名不能为空");
      return;
    }
    const currentItem = items.find((it) => it.key.id === keyId);
    if (currentItem && currentItem.key.label === trimmed) {
      setEditingKeyId(null);
      return;
    }

    setSavingKeyId(keyId);
    try {
      if (onRenameKey) {
        const ok = await onRenameKey(keyId, trimmed);
        if (ok) {
          feedbackToast.success("已更新渠道显示名");
          setEditingKeyId(null);
        } else {
          feedbackToast.error("更新渠道显示名失败");
        }
      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "更新渠道显示名失败");
    } finally {
      setSavingKeyId(null);
    }
  };

  const handleCancelKeyName = () => {
    setEditingKeyId(null);
    setKeyLabelInput("");
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

          {/* 模型名与行内改名 */}
          {editingName ? (
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveModelName();
                  if (e.key === "Escape") handleCancelModelName();
                }}
                autoFocus
                className="h-6 px-1.5 text-[13px] font-medium border border-[#D97757] rounded-md bg-white text-[#141413] focus:outline-none"
              />
              <Button
                variant="ghost"
                size="s"
                onClick={handleSaveModelName}
                className="h-6 text-[12px] px-1.5 text-[#141413]"
              >
                保存
              </Button>
              <Button
                variant="ghost"
                size="s"
                onClick={handleCancelModelName}
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
              <button
                type="button"
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
            {isShelved ? `${healthyChannelCount}/${items.length} 渠道可用` : "已下架"}
          </span>
          {isShelved && healthyChannelCount === 0 && (
            <span className="inline-flex items-center rounded-full bg-[#C0685C]/10 px-2 py-0.5 text-[12px] text-[#C0685C]">
              ⚠️ 无可用渠道
            </span>
          )}
        </div>

        {/* 卡头右侧：随手上下架主开关 + 添加渠道 */}
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {onToggleModelShelf && (
            <div className="flex items-center gap-1.5" title={isShelved ? "点击下架此模型" : "点击上架此模型"}>
              <span className="text-[12px] text-[#78716C] select-none">
                {isShelved ? "在册" : "下架"}
              </span>
              <Switch
                checked={isShelved}
                onCheckedChange={(checked) => {
                  void onToggleModelShelf(modelId, checked);
                }}
                aria-label={`是否上架模型 ${currentDisplayName}`}
              />
            </div>
          )}

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

      {/* 子级：展开的渠道与密钥明细（白纸排版 + 降噪呈现） */}
      {expanded && (
        <div id={`model-family-${modelId}`} className="divide-y divide-[#E2E2DF]/60 bg-white">
          {items.length === 0 ? (
            <div className="py-4 pl-8 text-left text-[12px] text-[#A8A29E]">
              暂未接入可用渠道，可点击右上角「为此模型添加接入渠道」。
            </div>
          ) : (
            items.map((item, index) => {
              const key = item.key;
              const isPending = pendingDeletionKeys.has(key.id);
              const isTesting = testingKeyId === key.id;
              const isEditingThisKey = editingKeyId === key.id;

              const health = getProviderKeyHealthStatus({
                isEnabled: key.is_enabled,
                lastSuccessAt: key.last_success_at,
                lastFailureAt: key.last_failure_at,
                unhealthyUntil: key.unhealthy_until,
              });

              const isFirst = index === 0;
              const isLast = index === items.length - 1;

              const successRelative = formatSimpleTime(key.last_success_at);
              const failureRelative = formatSimpleTime(key.last_failure_at);

              return (
                <div
                  key={key.id}
                  data-key-id={key.id}
                  className={cn(
                    "group flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-4 sm:pl-6 pr-3.5 py-2.5 transition-colors",
                    isPending
                      ? "opacity-50 pointer-events-none bg-[#F5F5F4]"
                      : key.is_enabled
                      ? "hover:bg-[#FCFCFB]"
                      : "bg-[#FAFAFA] text-[#A8A29E]"
                  )}
                >
                  {/* 左侧：优先级、开关、渠道名（就地改名）、状态与时间戳 */}
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C]">
                      P{key.priority}
                    </span>

                    {/* 渠道启用开关 */}
                    {onToggleKeyEnable && (
                      <Switch
                        checked={key.is_enabled}
                        onCheckedChange={(checked) => void onToggleKeyEnable(key.id, checked)}
                        aria-label="是否启用渠道"
                      />
                    )}

                    {/* 渠道显示名与就地编辑 */}
                    {isEditingThisKey ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={keyLabelInput}
                          onChange={(e) => setKeyLabelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveKeyName(key.id);
                            if (e.key === "Escape") handleCancelKeyName();
                          }}
                          autoFocus
                          disabled={savingKeyId === key.id}
                          className="h-6 px-1.5 text-[13px] font-medium border border-[#D97757] rounded-md bg-white text-[#141413] focus:outline-none"
                        />
                        <Button
                          variant="ghost"
                          size="s"
                          disabled={savingKeyId === key.id}
                          onClick={() => void handleSaveKeyName(key.id)}
                          className="h-6 text-[12px] px-1.5 text-[#141413]"
                        >
                          {savingKeyId === key.id ? "保存中" : "保存"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="s"
                          disabled={savingKeyId === key.id}
                          onClick={handleCancelKeyName}
                          className="h-6 text-[12px] px-1.5 text-[#78716C]"
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span
                          className="text-[13px] font-normal text-[#1F1E1D]"
                          title={key.api_key_masked ? `密钥 ${key.api_key_masked}` : undefined}
                        >
                          {key.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartRenameKey(key.id, key.label)}
                          className="size-5 flex items-center justify-center rounded hover:bg-[#EBEBE9] text-[#78716C] hover:text-[#141413] transition-colors"
                          title="修改渠道显示名"
                        >
                          <Pencil className="size-3" />
                        </button>
                      </div>
                    )}

                    <span className="text-[#E2E2DF]">·</span>

                    {/* 健康状态印记 */}
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

                    {/* 时间戳元数据（只在有记录时安静展现） */}
                    {successRelative && (
                      <span className="text-[12px] text-[#78716C] font-mono">
                        成功 {successRelative}
                      </span>
                    )}
                    {health === "unhealthy" && failureRelative && (
                      <span className="text-[12px] text-[#C0685C] font-mono">
                        失败 {failureRelative}
                      </span>
                    )}
                  </div>

                  {/* 右侧操作按钮组（常态降噪：高频单点暴露，低频悬浮微露） */}
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
                        {/* 悬浮显露的低频操作（排序/同步/删除） */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isFirst}
                            onClick={() => {
                              const prev = items[index - 1];
                              if (prev) {
                                void onSwapPriority(key.id, prev.key.id, key.priority, prev.key.priority);
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
                                void onSwapPriority(key.id, next.key.id, key.priority, next.key.priority);
                              }
                            }}
                            className="size-6 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                            title="降低优先级（下移）"
                          >
                            <ArrowDown className="size-3" />
                          </Button>

                          {onTestKeyAllModels && (
                            <Button
                              variant="ghost"
                              size="s"
                              onClick={() => void onTestKeyAllModels(key.id)}
                              className="h-6 px-1.5 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                              title="检测该渠道挂载的所有模型"
                            >
                              测全模型
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void onSyncKeyModels(key)}
                            className="size-6 text-[#78716C] hover:text-[#141413]"
                            title="重新探测并同步模型"
                          >
                            <RefreshCw className="size-3" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDeleteKeyWithCheck(key.id)}
                            className="size-6 text-[#78716C] hover:text-[#C0685C]"
                            title="删除此渠道"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>

                        {/* 常态始终可见的核心动作：单模型快速连通测试 */}
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
