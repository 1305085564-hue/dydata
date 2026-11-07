"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import type { AvailabilityModelFamily, AvailabilityChannel } from "@/lib/ai-config/availability";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { ModelChannelRow } from "./model-channel-row";
import { FindChannelsPanel } from "./find-channels-panel";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import type { AiConfigCommandResult } from "@/lib/ai-config/client-command";
import { useFrozenOrder } from "../hooks/use-frozen-order";
import { cn } from "@/lib/utils";

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
  diagnosticMap?: Record<string, ChannelFailureDiagnostic>;
  onToggleSupply?: (keyModelId: string, enabled: boolean) => Promise<void>;
  onToggleModelEnabled?: (modelId: string, enabled: boolean) => Promise<void>;
  onRenameSupply?: (keyModelId: string, newName: string) => Promise<void>;
  onSwapOrder?: (modelId: string, keyModelId: string, targetKeyModelId: string) => Promise<void>;
  onTestSupply?: (keyId: string, modelId: string) => Promise<void>;
  onDeleteSupply?: (keyModelId: string) => Promise<void>;
  onOpenSupply?: (keyId: string, modelId: string) => Promise<AiConfigCommandResult>;
  runCommand?: (action: string, data?: Record<string, unknown>) => Promise<AiConfigCommandResult>;
  testingKeyModelId?: string | null;
}

export function ModelFamilyCard({
  family,
  diagnosticMap = {},
  onToggleSupply = async () => {},
  onToggleModelEnabled = async () => {},
  onRenameSupply = async () => {},
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

  const isChannelsVisible = family.isShelved || channelsExpanded;

  const channels = useMemo(() => family.channels ?? [], [family.channels]);

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
      className={cn(
        "transition-colors",
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
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#FCFCFB]"
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
          <span className="font-normal text-[14px] text-[#141413]">
            {family.displayName}
          </span>
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

        {/* 头部右侧操作 */}
        <div className="flex items-center gap-2">
          {/* N2: 为此模型找渠道 */}
          <Button
            size="s"
            variant="outline"
            onClick={() => setShowFindChannels(!showFindChannels)}
            className="h-7 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            <Plus className="size-3" />
            <span>为此模型找渠道</span>
          </Button>

          {/* N4: 停用模型 / 恢复模型 */}
          <Button
            size="s"
            variant="ghost"
            disabled={isTogglingModel}
            onClick={handleToggleModel}
            className={cn(
              "h-7 gap-1 text-[12px]",
              isModelEnabled
                ? "text-[#78716C] hover:text-status-danger"
                : "text-[#4B6B4E] hover:bg-[#4B6B4E]/10"
            )}
          >
            {isModelEnabled ? (
              <>
                <PowerOff className="size-3" />
                <span>停用模型</span>
              </>
            ) : (
              <>
                <Power className="size-3" />
                <span>恢复模型</span>
              </>
            )}
          </Button>
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
                  onRename={onRenameSupply}
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
                          onRename={onRenameSupply}
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
