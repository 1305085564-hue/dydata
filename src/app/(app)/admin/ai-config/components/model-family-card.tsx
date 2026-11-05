"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type { AiProviderKey, AiModelTestResult } from "../hooks/use-ai-config";
import type { AvailabilityModelFamily, AvailabilityChannel } from "@/lib/ai-config/availability";
import { ModelTestFeedback, modelTestKey } from "./model-test-feedback";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { CHANNEL_IDENTITY_PRESENTATION, formatSleepCountdown } from "@/lib/ai-config/presentation";
import { cn } from "@/lib/utils";

export type ModelFamilyKeyItem = {
  key: AiProviderKey;
  providerName: string;
  modelRecordId: string;
  sortOrder?: number;
  modelId: string;
  displayName: string;
};

interface ModelFamilyCardProps {
  modelId: string;
  displayName: string;
  items: ModelFamilyKeyItem[];
  availabilityFamily?: AvailabilityModelFamily;
  highlightedModelIds?: string[];
  isShelved?: boolean;
  onRenameModel?: (modelId: string, modelRecordId: string, newDisplayName: string) => Promise<boolean>;
  onRenameKey?: (keyId: string, newLabel: string) => Promise<boolean>;
  onToggleModelShelf?: (modelId: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  onToggleKeyEnable?: (keyId: string, enabled: boolean) => Promise<boolean>;
  onTestKey: (keyId: string, modelId: string) => Promise<unknown>;
  modelTestResults?: Record<string, AiModelTestResult>;
  onClearTestResult?: (keyId: string, modelId: string) => void;
  onSyncKeyModels: (key: AiProviderKey) => Promise<void>;
  onDeleteKeyWithCheck: (keyId: string) => void;
  onAddChannelForModel: (modelId: string) => void;
  onSwapOrder?: (modelId: string, keyModelId: string, targetKeyModelId: string) => Promise<void>;
  onSetKeySleep?: (keyId: string, sleep: boolean) => Promise<void>;
}

function formatSleepTargetTime(sleepUntilIso?: string | null): string {
  if (!sleepUntilIso) return "";
  const d = new Date(sleepUntilIso);
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function ModelFamilyCard({
  modelId,
  displayName,
  items,
  availabilityFamily,
  highlightedModelIds = [],
  isShelved = true,
  onRenameModel,
  onRenameKey,
  onToggleModelShelf,
  onToggleKeyEnable,
  onTestKey,
  modelTestResults,
  onClearTestResult,
  onSyncKeyModels,
  onDeleteKeyWithCheck,
  onAddChannelForModel,
  onSwapOrder,
  onSetKeySleep,
}: ModelFamilyCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [movingOrder, setMovingOrder] = useState(false);

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

  // 从 availabilityFamily 获取五态统计
  const identityCounts = availabilityFamily?.identityCounts ?? {
    active: 0,
    retest: 0,
    sleeping: 0,
    invalid: 0,
    disabled: 0,
  };
  const schedulableCount = availabilityFamily?.schedulableChannelCount ?? items.filter((it) => it.key.is_enabled).length;
  const redundancyCount = availabilityFamily?.redundancyCount ?? Math.max(0, schedulableCount - 1);
  const singlePointRisk = availabilityFamily?.singlePointRisk ?? (schedulableCount <= 1);

  // 映射 items 与 availabilityChannel
  const channelGovernanceMap = useMemo(() => {
    const map = new Map<string, AvailabilityChannel>();
    if (availabilityFamily?.channels) {
      for (const ch of availabilityFamily.channels) {
        map.set(ch.keyId, ch);
      }
    }
    return map;
  }, [availabilityFamily]);

  // 任务 D 规格：availability 缺失时不收纳（保持全量主列表），存在时将 invalid/disabled 归入底部折叠收纳区
  const { activeItems, archivedItems } = useMemo(() => {
    if (!availabilityFamily) {
      return { activeItems: items, archivedItems: [] as ModelFamilyKeyItem[] };
    }

    const active: ModelFamilyKeyItem[] = [];
    const archived: ModelFamilyKeyItem[] = [];

    for (const item of items) {
      const governance = channelGovernanceMap.get(item.key.id);
      const identity = governance?.identity ?? (item.key.is_enabled ? "active" : "disabled");
      if (identity === "invalid" || identity === "disabled") {
        archived.push(item);
      } else {
        active.push(item);
      }
    }

    return { activeItems: active, archivedItems: archived };
  }, [availabilityFamily, items, channelGovernanceMap]);

  // 任务 D 规格：主列表为空且收纳区非空时，收纳区自动展开
  const isArchivedOpen = archivedExpanded || (activeItems.length === 0 && archivedItems.length > 0);

  // 一次性、待删、勿参考：仅移除不可达的旧全局顺位分支。
  const handleMove = async (item: ModelFamilyKeyItem, target: ModelFamilyKeyItem) => {
    if (movingOrder) return;
    setMovingOrder(true);
    try {
      if (onSwapOrder) {
        await onSwapOrder(modelId, item.modelRecordId, target.modelRecordId);

      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "调整渠道顺序失败，已回滚");
    } finally {
      setMovingOrder(false);
    }
  };

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
        !isShelved && "opacity-75 bg-surface-row-hover",
        isHighlighted && "ring-1 ring-[#141413]/20"
      )}
    >
      {/* 头部：模型名称与五态综合统计 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`model-family-${modelId}`}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#FCFCFB] border-b border-[#E2E2DF]/60 hover:bg-[#F7F7F6] cursor-pointer select-none transition-colors"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
        }}
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
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                  if (e.key === "Enter") handleSaveModelName();
                  if (e.key === "Escape") handleCancelModelName();
                }}
                autoFocus
                className="h-6 px-1.5 text-[14px] border border-[#78716C] rounded-md bg-white text-[#141413] focus:outline-none"
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
              <span className="text-[14px] text-[#141413] truncate">
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

          {/* 五态一句话汇总 */}
          {isShelved ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[#78716C] shrink-0">
              <span>共 {items.length} 条：</span>
              <span className="text-[#4B6B4E]">{identityCounts.active} 正常在岗</span>
              {identityCounts.retest > 0 && <span className="text-[#8A6A2F]">· {identityCounts.retest} 待复测</span>}
              {identityCounts.sleeping > 0 && <span>· {identityCounts.sleeping} 休眠中</span>}
              {(identityCounts.invalid + identityCounts.disabled) > 0 && (
                <span className="text-status-danger-text">· {identityCounts.invalid + identityCounts.disabled} 已失效或停用</span>
              )}
              <span className="text-[#E2E2DF]">|</span>
              <span className={cn(
                "font-normal",
                redundancyCount > 0 ? "text-[#4B6B4E]" : "text-[#8A6A2F]"
              )}>
                真实可用冗余 {redundancyCount} 条
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C] shrink-0">
              已下架
            </span>
          )}
        </div>

        {/* 右侧：上下架开关与新增渠道 */}
        <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
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

      {/* 单点风险预警黄条（真实冗余 ≤ 1 且上架在册时展示） */}
      {isShelved && expanded && singlePointRisk && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 text-[12px] border-b",
          schedulableCount === 0
            ? "bg-status-danger/[0.06] border-status-danger/20 text-status-danger-text"
            : "bg-[#8A6A2F]/10 border-[#8A6A2F]/20 text-[#8A6A2F]"
        )}>
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            {schedulableCount === 0
              ? "当前模型无任何可用接入渠道，相关功能调度时将直接触发降级或失败，请尽快排查或接入备用渠道。"
              : "当前模型真实可用冗余为 0 条（仅 1 条在承担流量），处于单点风险中，建议补充接入渠道以确保高可用。"}
          </span>
        </div>
      )}

      {/* 展开的渠道列表 */}
      {expanded && (
        <div id={`model-family-${modelId}`} className="divide-y divide-[#E2E2DF]/60 bg-white">
          {activeItems.length === 0 ? (
            <div className="py-4 pl-8 text-left text-[12px] text-[#A8A29E]">
              暂未接入可用渠道，可点击右上角「为此模型添加接入渠道」。
            </div>
          ) : (
            activeItems.map((item, index) => {
              const key = item.key;
              const governance = channelGovernanceMap.get(key.id);
              const identity = governance?.identity ?? (key.is_enabled ? "active" : "disabled");
              const isTesting = testingKeyId === key.id;
              const isEditingThisKey = editingKeyId === key.id;

              const isSleeping = identity === "sleeping";

              // 任务 D 规格：主列表仅 active/retest 可移动，沿移动方向查找最近的 active/retest 行（跳过 sleeping）
              let prevTarget: ModelFamilyKeyItem | null = null;
              if (!isSleeping) {
                for (let i = index - 1; i >= 0; i--) {
                  const candidateIdentity = channelGovernanceMap.get(activeItems[i].key.id)?.identity ?? (activeItems[i].key.is_enabled ? "active" : "disabled");
                  if (candidateIdentity === "active" || candidateIdentity === "retest") {
                    prevTarget = activeItems[i];
                    break;
                  }
                }
              }

              let nextTarget: ModelFamilyKeyItem | null = null;
              if (!isSleeping) {
                for (let i = index + 1; i < activeItems.length; i++) {
                  const candidateIdentity = channelGovernanceMap.get(activeItems[i].key.id)?.identity ?? (activeItems[i].key.is_enabled ? "active" : "disabled");
                  if (candidateIdentity === "active" || candidateIdentity === "retest") {
                    nextTarget = activeItems[i];
                    break;
                  }
                }
              }

              const canMoveUp = !isSleeping && prevTarget !== null;
              const canMoveDown = !isSleeping && nextTarget !== null;

              const sleepUntil = governance?.sleepUntil ?? key.unhealthy_until;
              const isManualSleep = governance?.sleepSource === "manual" || (key.manual_sleep_until != null && new Date(key.manual_sleep_until).getTime() > Date.now());

              const isInvalidOrDisabled = identity === "invalid" || identity === "disabled";

              return (
                <div
                  key={key.id}
                  data-key-id={key.id}
                  className={cn(
                    "group flex flex-col justify-between gap-2 pl-4 sm:pl-6 pr-3.5 py-2.5 transition-colors",
                    isInvalidOrDisabled
                      ? "bg-[#FAF9F8] text-[#78716C]"
                      : key.is_enabled
                      ? "hover:bg-[#FCFCFB]"
                      : "bg-surface-row-hover text-[#A8A29E]"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    {/* 左侧：顺位序号、开关、渠道名、五态标签与休眠倒计时 */}
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {/* 纯净顺位序号：取代底层 P55 数字 */}
                      <span
                        className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C] min-w-[24px] text-center shrink-0"
                        title={`第 ${index + 1} 候选顺位`}
                      >
                        #{index + 1}
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
                              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                              if (e.key === "Enter") void handleSaveKeyName(key.id);
                              if (e.key === "Escape") handleCancelKeyName();
                            }}
                            autoFocus
                            disabled={savingKeyId === key.id}
                            className="h-6 px-1.5 text-[14px] border border-[#78716C] rounded-md bg-white text-[#141413] focus:outline-none"
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
                            className="text-[14px] font-normal text-[#1F1E1D]"
                            title={key.api_key_masked ? `渠道凭证 ${key.api_key_masked}` : undefined}
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

                      {/* 五态唯一互斥身份印记 */}
                      {identity === "active" && (
                        <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.active.color)}>
                          <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.active.dot)} />
                          {CHANNEL_IDENTITY_PRESENTATION.active.label}
                        </span>
                      )}

                      {identity === "retest" && (
                        <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.retest.color)}>
                          <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.retest.dot)} />
                          {CHANNEL_IDENTITY_PRESENTATION.retest.label}
                        </span>
                      )}

                      {identity === "sleeping" && (
                        <div className="inline-flex items-center gap-1.5">
                          <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.sleeping.color)}>
                            <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.sleeping.dot)} />
                            {isManualSleep ? "管理员手动休眠" : "自动休眠中"} · {formatSleepCountdown(sleepUntil)}
                            {!isManualSleep && sleepUntil && (
                              <span className="text-[#A8A29E] font-mono">（预计 {formatSleepTargetTime(sleepUntil)} 复测）</span>
                            )}
                          </span>

                          {/* 手动休眠恢复调度入口 */}
                          {isManualSleep && onSetKeySleep && (
                            <Button
                              variant="ghost"
                              size="s"
                              onClick={async () => {
                                try {
                                  await onSetKeySleep(key.id, false);
                                  feedbackToast.success(`已恢复渠道「${key.label}」调度`);
                                } catch {
                                  feedbackToast.error("恢复调度失败");
                                }
                              }}
                              className="h-5 px-1.5 text-[11px] text-[#4B6B4E] hover:bg-[#4B6B4E]/10"
                            >
                              恢复调度
                            </Button>
                          )}
                        </div>
                      )}

                      {identity === "invalid" && (
                        <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.invalid.color)}>
                          <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.invalid.dot)} />
                          {governance?.persistentFailure ? "持续不可用（连续失败超24小时）" : CHANNEL_IDENTITY_PRESENTATION.invalid.label}
                        </span>
                      )}

                      {identity === "disabled" && (
                        <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.disabled.color)}>
                          <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.disabled.dot)} />
                          {CHANNEL_IDENTITY_PRESENTATION.disabled.label}
                        </span>
                      )}

                      {/* 已就绪但全站未启用 */}
                      {key.is_enabled && !isShelved && (
                        <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#8A6A2F]/10 text-[#8A6A2F] border border-[#8A6A2F]/20">
                          已就绪，但全站未启用
                        </span>
                      )}
                    </div>

                    {/* 右侧操作按钮组 */}
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                      {/* 顺位上移/下移（只动当前模型，跳过休眠与不可用渠道互换） */}
                      <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canMoveUp || movingOrder}
                          onClick={() => {
                            if (prevTarget) void handleMove(item, prevTarget);
                          }}
                          className="size-6 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title={isSleeping ? "休眠期间顺位锁定，恢复后可调整" : "提高优先级（上移）"}
                          aria-label={isSleeping ? "休眠期间顺位锁定，恢复后可调整" : "提高优先级（上移）"}
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canMoveDown || movingOrder}
                          onClick={() => {
                            if (nextTarget) void handleMove(item, nextTarget);
                          }}
                          className="size-6 text-[#78716C] hover:text-[#1F1E1D] disabled:opacity-30"
                          title={isSleeping ? "休眠期间顺位锁定，恢复后可调整" : "降低优先级（下移）"}
                          aria-label={isSleeping ? "休眠期间顺位锁定，恢复后可调整" : "降低优先级（下移）"}
                        >
                          <ArrowDown className="size-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void onSyncKeyModels(key)}
                          className="size-6 text-[#78716C] hover:text-[#141413]"
                          title="打开全部模型清单"
                          aria-label="同步模型"
                        >
                          <RefreshCw className="size-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteKeyWithCheck(key.id)}
                          className="size-6 text-[#78716C] hover:text-status-danger"
                          title="删除此渠道"
                          aria-label="删除此渠道"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>

                      {/* 测此渠道此模型主行动按钮 */}
                      <Button
                        variant="outline"
                        size="s"
                        disabled={isTesting}
                        onClick={() => handleTest(key.id)}
                        className="h-6.5 text-[12px] px-2 border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        title="测这条渠道供应的当前模型"
                        aria-label="测此渠道此模型"
                      >
                        {isTesting ? (
                          <Loader2 className="size-3 animate-spin mr-1 text-[#78716C]" />
                        ) : (
                          <Play className="size-3 text-[#78716C] mr-1" />
                        )}
                        测此渠道此模型
                      </Button>
                    </div>
                  </div>

                  {/* 测此渠道测试反馈与处置入口 */}
                  <ModelTestFeedback
                    result={modelTestResults?.[modelTestKey(key.id, modelId)]}
                    keyId={key.id}
                    onSleepKey={onSetKeySleep ? async (kId) => { await onSetKeySleep(kId, true); } : undefined}
                    onDismiss={() => onClearTestResult?.(key.id, modelId)}
                  />
                </div>
              );
            })
          )}

          {/* 任务 D：底部折叠收纳区（不可用渠道：已失效或已停用） */}
          {archivedItems.length > 0 && (
            <div className="border-t border-[#E2E2DF]/80 bg-[#FAF9F8]">
              <button
                type="button"
                onClick={() => setArchivedExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-2.5 text-[12px] text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#F5F4F2] transition-colors"
                aria-expanded={isArchivedOpen}
              >
                <span className="font-medium">
                  {archivedItems.length} 个不可用渠道（已失效或停用）
                </span>
                {isArchivedOpen ? (
                  <ChevronDown className="size-4 text-[#78716C]" />
                ) : (
                  <ChevronRight className="size-4 text-[#78716C]" />
                )}
              </button>

              {isArchivedOpen && (
                <div className="divide-y divide-[#E2E2DF]/60 border-t border-[#E2E2DF]/60 bg-[#FAF9F8]">
                  {archivedItems.map((item) => {
                    const key = item.key;
                    const governance = channelGovernanceMap.get(key.id);
                    const identity = governance?.identity ?? (key.is_enabled ? "active" : "disabled");
                    const isTesting = testingKeyId === key.id;
                    const isEditingThisKey = editingKeyId === key.id;

                    return (
                      <div
                        key={key.id}
                        data-key-id={key.id}
                        className="group flex flex-col justify-between gap-2 pl-4 sm:pl-6 pr-3.5 py-2.5 bg-[#FAF9F8] text-[#78716C] transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {/* 左侧：开关、渠道名、原因徽章（无顺位序号） */}
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
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
                                    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                                    if (e.key === "Enter") void handleSaveKeyName(key.id);
                                    if (e.key === "Escape") handleCancelKeyName();
                                  }}
                                  autoFocus
                                  disabled={savingKeyId === key.id}
                                  className="h-6 px-1.5 text-[14px] border border-[#78716C] rounded-md bg-white text-[#141413] focus:outline-none"
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
                                  className="text-[14px] font-normal text-[#78716C]"
                                  title={key.api_key_masked ? `渠道凭证 ${key.api_key_masked}` : undefined}
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

                            {/* 原因徽章 */}
                            {identity === "invalid" && (
                              <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.invalid.color)}>
                                <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.invalid.dot)} />
                                {governance?.persistentFailure ? "持续不可用（连续失败超24小时）" : CHANNEL_IDENTITY_PRESENTATION.invalid.label}
                              </span>
                            )}

                            {identity === "disabled" && (
                              <span className={cn("inline-flex items-center gap-1 text-[12px]", CHANNEL_IDENTITY_PRESENTATION.disabled.color)}>
                                <span className={cn("size-1.5 rounded-full", CHANNEL_IDENTITY_PRESENTATION.disabled.dot)} />
                                {CHANNEL_IDENTITY_PRESENTATION.disabled.label}
                              </span>
                            )}

                            {/* 已就绪但全站未启用 */}
                            {key.is_enabled && !isShelved && (
                              <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#8A6A2F]/10 text-[#8A6A2F] border border-[#8A6A2F]/20">
                                已就绪，但全站未启用
                              </span>
                            )}
                          </div>

                          {/* 右侧操作按钮组：无上移/下移按钮 */}
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                            <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void onSyncKeyModels(key)}
                                className="size-6 text-[#78716C] hover:text-[#141413]"
                                title="打开全部模型清单"
                                aria-label="同步模型"
                              >
                                <RefreshCw className="size-3" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteKeyWithCheck(key.id)}
                                className="size-6 text-[#78716C] hover:text-status-danger"
                                title="删除此渠道"
                                aria-label="删除此渠道"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>

                            {/* 测此渠道此模型主行动按钮 */}
                            <Button
                              variant="outline"
                              size="s"
                              disabled={isTesting}
                              onClick={() => handleTest(key.id)}
                              className="h-6.5 text-[12px] px-2 border-[#E2E2DF] text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                              title="测这条渠道供应的当前模型"
                              aria-label="测此渠道此模型"
                            >
                              {isTesting ? (
                                <Loader2 className="size-3 animate-spin mr-1 text-[#78716C]" />
                              ) : (
                                <Play className="size-3 text-[#78716C] mr-1" />
                              )}
                              测此渠道此模型
                            </Button>
                          </div>
                        </div>

                        {/* 测此渠道测试反馈与处置入口 */}
                        <ModelTestFeedback
                          result={modelTestResults?.[modelTestKey(key.id, modelId)]}
                          keyId={key.id}
                          onSleepKey={onSetKeySleep ? async (kId) => { await onSetKeySleep(kId, true); } : undefined}
                          onDismiss={() => onClearTestResult?.(key.id, modelId)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
