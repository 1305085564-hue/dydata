"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Power,
  PowerOff,
  Edit2,
  Check,
  X,
} from "lucide-react";
import type { AvailabilityModelFamily, AvailabilityChannel } from "@/lib/ai-config/availability";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { ModelChannelRow } from "./model-channel-row";
import { FindChannelsPanel } from "./find-channels-panel";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AiConfigCommandResult } from "@/lib/ai-config/client-command";
import { useFrozenOrder } from "../hooks/use-frozen-order";
import { cn } from "@/lib/utils";
import { ROW_SELECTED } from "@/components/ui/selection";
import { MODEL_CARD_ATTR } from "../ai-config-view";

// 渠道行顺序只认真实顺位：身份（待复测/休眠等）变化不改标记，不触发重排
export function channelOrderResetKey(channels: readonly AvailabilityChannel[]): string {
  return channels
    .map((channel) => `${channel.keyModelId}:${channel.sortOrder}`)
    .sort()
    .join("|");
}

// 沿顺位方向找最近的可调度渠道；起点和目标都必须可调度，休眠/失效/停用的行不参与交换（后端只接受两端都可调度）
export function findMoveTarget(
  channels: AvailabilityChannel[],
  keyModelId: string,
  direction: -1 | 1,
): AvailabilityChannel | null {
  const idx = channels.findIndex((c) => c.keyModelId === keyModelId);
  if (idx === -1 || !channels[idx].isSchedulable) return null;
  for (let i = idx + direction; i >= 0 && i < channels.length; i += direction) {
    if (channels[i].isSchedulable) return channels[i];
  }
  return null;
}

export interface ModelFamilyCardProps {
  family: AvailabilityModelFamily;
  /** 「在给 截图识别、文案生成 用」；没有功能在用时为空 */
  usageText?: string | null;
  /** 被功能表「去修 →」定位过来：展开渠道并用选中色标出 */
  focused?: boolean;
  diagnosticMap?: Record<string, ChannelFailureDiagnostic>;
  onToggleSupply?: (keyModelId: string, enabled: boolean) => Promise<void>;
  onToggleModelEnabled?: (modelId: string, enabled: boolean) => Promise<void>;
  /**
   * 模型显示名是「模型级」字段：一个模型的所有渠道共用一份。
   * 改名入口只能挂在模型标题上；挂在渠道行会让人以为在改渠道名，
   * 实际一次保存会把整个模型在库里的显示名一起改掉（历史上正是这样被写成渠道名）。
   * 服务端 RPC 以任一条供应 id 定位模型，因此这里传第一条供应的 id。
   */
  onRenameModel?: (keyModelId: string, newName: string) => Promise<void>;
  onSwapOrder?: (modelId: string, keyModelId: string, targetKeyModelId: string) => Promise<void>;
  onTestSupply?: (keyId: string, modelId: string) => Promise<void>;
  onDeleteSupply?: (keyModelId: string) => Promise<void>;
  onOpenSupply?: (keyId: string, modelId: string) => Promise<AiConfigCommandResult>;
  runCommand?: (action: string, data?: Record<string, unknown>) => Promise<AiConfigCommandResult>;
  testingKeyModelId?: string | null;
}

export function ModelFamilyCard({
  family,
  usageText = null,
  focused = false,
  diagnosticMap = {},
  onToggleSupply = async () => {},
  onToggleModelEnabled = async () => {},
  onRenameModel = async () => {},
  onSwapOrder = async () => {},
  onTestSupply = async () => {},
  onDeleteSupply = async () => {},
  onOpenSupply = async () => ({ ok: true, body: {} }),
  runCommand = async () => ({ ok: true, body: {} }),
  testingKeyModelId,
}: ModelFamilyCardProps) {
  const [showFindChannels, setShowFindChannels] = useState(false);
  const [disabledExpanded, setDisabledExpanded] = useState(false);
  const [isTogglingModel, setIsTogglingModel] = useState(false);
  const [channelsExpanded, setChannelsExpanded] = useState(false);

  const isChannelsVisible = family.isShelved || channelsExpanded || focused;

  const channels = useMemo(() => family.channels ?? [], [family.channels]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const renameAnchorId = channels[0]?.keyModelId ?? null;

  const handleStartRename = () => {
    if (!renameAnchorId) return;
    setEditingNameValue(family.displayName);
    setIsEditingName(true);
  };

  const handleSaveRename = async () => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) {
      feedbackToast.error("模型显示名不能为空");
      return;
    }
    if (!renameAnchorId) return;
    if (trimmed === family.displayName) {
      setIsEditingName(false);
      return;
    }
    await onRenameModel(renameAnchorId, trimmed);
    setIsEditingName(false);
  };

  // 口径 4: 模型内只有一种排队顺序，按真实顺位；测试/身份变化不跳行，成员或顺位变化才重建
  const frozenChannels = useFrozenOrder(
    channels,
    (channel) => channel.keyModelId,
    (a, b) => a.sortOrder - b.sortOrder || a.keyModelId.localeCompare(b.keyModelId),
    channelOrderResetKey(channels),
  );

  const schedulableCount = family.schedulableChannelCount;
  // 「能用」= 绿灯 active；未测过的渠道也是 active，不能因为没测过就不计入。
  const activeCount = family.identityCounts.active;
  const retestCount = family.identityCounts.retest;
  const isSingleSupply = schedulableCount === 1 && activeCount > 0;
  const isNoSupply = schedulableCount === 0;
  const isRetestOnly = isNoSupply === false && activeCount === 0 && retestCount > 0;
  const needsMoreChannels = family.isShelved && (isNoSupply || isSingleSupply);

  // 查找交换对象仍按真实顺位，不用展示快照位置推断相邻关系
  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [channels]);

  // 口径 5: 需要你处理必须留在主列表；只有已停用可以折叠
  const { mainChannels, disabledChannels } = useMemo(() => {
    const main: AvailabilityChannel[] = [];
    const disabled: AvailabilityChannel[] = [];
    for (const ch of frozenChannels) {
      if (ch.identity === "disabled") {
        disabled.push(ch);
      } else {
        main.push(ch);
      }
    }
    return { mainChannels: main, disabledChannels: disabled };
  }, [frozenChannels]);

  // 如果主列表没有供应，但有已停用供应，默认展开
  const isShowDisabled = disabledExpanded || (mainChannels.length === 0 && disabledChannels.length > 0);

  // 判断模型当前是否整体启用（是否有任意供应开着）
  const isModelEnabled = family.channels.some((c) => c.identity !== "disabled");

  const handleToggleModel = async () => {
    setIsTogglingModel(true);
    try {
      await onToggleModelEnabled(family.modelId, !isModelEnabled);
    } finally {
      setIsTogglingModel(false);
    }
  };

  const handleMoveOrder = async (keyModelId: string, direction: "up" | "down") => {
    const target = findMoveTarget(sortedChannels, keyModelId, direction === "up" ? -1 : 1);
    if (!target) return;
    await onSwapOrder(family.modelId, keyModelId, target.keyModelId);
  };

  return (
    <div
      {...{ [MODEL_CARD_ATTR]: family.modelId }}
      className={cn(
        "scroll-mt-[calc(var(--app-top-offset)+64px)] transition-colors",
        !family.isShelved
          ? "bg-[#F7F7F6]/40 opacity-80"
          : isNoSupply
          ? "bg-[#FCFCFB]"
          : "bg-white"
      )}
    >
      {/* 头部：模型名称、S5 汇总与停用/找渠道操作 */}
      <div
        data-slot="ai-model-header"
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 py-2",
          focused ? ROW_SELECTED : "bg-[#FCFCFB]",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          {!family.isShelved && (
            <button
              type="button"
              onClick={() => setChannelsExpanded((v) => !v)}
              aria-expanded={isChannelsVisible}
              aria-label={isChannelsVisible ? "收起渠道" : "展开渠道"}
              className="inline-flex items-center text-[#78716C] hover:text-[#141413]"
            >
              {isChannelsVisible ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          )}
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <Input
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                className="h-7 w-[200px] text-[13px] border-[#E2E2DF]"
                placeholder="模型显示名（此模型所有渠道共用）"
                aria-label="修改模型显示名"
                autoFocus
                onKeyDown={(e) => {
                  // 中文输入法选词回车不能触发保存
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                  if (e.key === "Enter") handleSaveRename();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
              />
              <Button
                variant="ghost"
                size="icon-s"
                onClick={handleSaveRename}
                className="size-6 text-[#4B6B4E]"
                title="保存模型显示名"
                aria-label="保存模型显示名"
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
            <span className="inline-flex items-center gap-1">
              <span className="font-normal text-[14px] text-[#141413]">
                {family.displayName}
              </span>
              {renameAnchorId && (
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={handleStartRename}
                  className="size-5 text-[#A8A29E] hover:text-[#141413]"
                  title="修改模型显示名（此模型所有渠道共用，不改渠道名）"
                  aria-label="修改模型显示名"
                >
                  <Edit2 className="size-2.5" />
                </Button>
              )}
            </span>
          )}
          <span className="font-mono text-[12px] text-[#78716C]">
            {family.modelId}
          </span>
          {isNoSupply && (
            <span className="rounded-md bg-status-danger/[0.10] px-2 py-0.5 text-[12px] text-status-danger-text">
              暂时不可用
            </span>
          )}

          {/* S5: 模型卡汇总：「M 条渠道供货，N 条能用，K 条待复测」；待复测不算能用 */}
          <span className="text-[12px] text-[#1F1E1D]">
            {channels.length} 条渠道供货，{activeCount} 条能用
            {retestCount > 0 && <span className="text-[#8A6A2F]">，{retestCount} 条待复测</span>}
          </span>

          {usageText && <span className="text-[12px] text-[#78716C]">· {usageText}</span>}

          {/* 恰好 1 条能用时的单点建议 */}
          {isSingleSupply && (
            <span className="text-[12px] text-[#8A6A2F]">
              · {AI_CONFIG_MESSAGES["model.single_supply"]}
            </span>
          )}

          {/* 没有完全健康渠道、但还有待复测时，别误报“停摆” */}
          {isRetestOnly && (
            <span className="text-[12px] text-[#8A6A2F]">
              · 暂无完全健康渠道，{retestCount} 条待复测
            </span>
          )}

          {/* 0 条能用时的原因 */}
          {isNoSupply && family.unavailableReasonKey && (
            <span className="text-[12px] text-status-danger-text">
              · {AI_CONFIG_MESSAGES[family.unavailableReasonKey]}
            </span>
          )}
        </div>

        {/* 头部右侧操作：缺渠道时「为此模型找渠道」是答案，用带字按钮；平时收成图标，不让每张卡都摆两个按钮 */}
        <div className="flex items-center gap-1">
          {needsMoreChannels ? (
            <Button
              size="s"
              variant="outline"
              onClick={() => setShowFindChannels(!showFindChannels)}
              className="h-7 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              <Plus className="size-3" />
              <span>为此模型找渠道</span>
            </Button>
          ) : (
            <Button
              size="icon-s"
              variant="ghost"
              onClick={() => setShowFindChannels(!showFindChannels)}
              className="size-7 text-[#78716C] hover:text-[#141413]"
              title="为此模型找渠道"
              aria-label="为此模型找渠道"
            >
              <Plus className="size-3.5" />
            </Button>
          )}

          {/* N4: 停用模型 / 恢复模型；停用是低频动作收成图标，恢复是停用模型的答案保留文字 */}
          {isModelEnabled ? (
            <Button
              size="icon-s"
              variant="ghost"
              disabled={isTogglingModel}
              onClick={handleToggleModel}
              className="size-7 text-[#78716C] hover:text-status-danger"
              title="停用模型"
              aria-label="停用模型"
            >
              <PowerOff className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="s"
              variant="ghost"
              disabled={isTogglingModel}
              onClick={handleToggleModel}
              className="h-7 gap-1 text-[12px] text-[#4B6B4E] hover:bg-[#4B6B4E]/10"
            >
              <Power className="size-3" />
              <span>恢复模型</span>
            </Button>
          )}
        </div>
      </div>

      {/* N2 找渠道抽屉 */}
      {showFindChannels && (
        <FindChannelsPanel
          modelId={family.modelId}
          onOpenSupply={onOpenSupply}
          onClose={() => setShowFindChannels(false)}
          runCommand={runCommand}
        />
      )}

      {/* 渠道供应主列表 */}
      {isChannelsVisible && (
        channels.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-[#78716C]">
            当前没有接入提供此模型的渠道。点击上方「为此模型找渠道」扫描已接入渠道，或在顶部接入新渠道。
          </div>
        ) : (
          <div className="border-t border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60">
            {/* 1. 主列表：能用 / 歇着 / 需要你处理 */}
            {mainChannels.map((channel) => {
              const canMoveUp = findMoveTarget(sortedChannels, channel.keyModelId, -1) !== null;
              const canMoveDown = findMoveTarget(sortedChannels, channel.keyModelId, 1) !== null;

              return (
                <ModelChannelRow
                  key={channel.keyModelId}
                  channel={channel}
                  modelId={family.modelId}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => handleMoveOrder(channel.keyModelId, "up")}
                  onMoveDown={() => handleMoveOrder(channel.keyModelId, "down")}
                  onToggleEnabled={onToggleSupply}
                  onTest={onTestSupply}
                  onDeleteSupply={onDeleteSupply}
                  failureDiagnostic={diagnosticMap[channel.keyModelId]}
                  isTesting={testingKeyModelId === channel.keyModelId}
                />
              );
            })}

            {/* 2. 已停用供应折叠区（只有已停用可以折叠） */}
            {disabledChannels.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDisabledExpanded(!disabledExpanded)}
                  className="flex w-full items-center gap-1 px-4 py-2 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#F7F7F6]"
                >
                  {isShowDisabled ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  <span>已停用的供应 ({disabledChannels.length})</span>
                </button>

                {isShowDisabled && (
                  <div className="border-t border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60">
                    {disabledChannels.map((channel) => {
                      const canMoveUp = findMoveTarget(sortedChannels, channel.keyModelId, -1) !== null;
                      const canMoveDown = findMoveTarget(sortedChannels, channel.keyModelId, 1) !== null;

                      return (
                        <ModelChannelRow
                          key={channel.keyModelId}
                          channel={channel}
                          modelId={family.modelId}
                          canMoveUp={canMoveUp}
                          canMoveDown={canMoveDown}
                          onMoveUp={() => handleMoveOrder(channel.keyModelId, "up")}
                          onMoveDown={() => handleMoveOrder(channel.keyModelId, "down")}
                          onToggleEnabled={onToggleSupply}
                                  onTest={onTestSupply}
                          onDeleteSupply={onDeleteSupply}
                          failureDiagnostic={diagnosticMap[channel.keyModelId]}
                          isTesting={testingKeyModelId === channel.keyModelId}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
