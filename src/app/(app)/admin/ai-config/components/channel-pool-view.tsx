"use client";

import { useMemo, useState } from "react";
import type { AiConfigBundle, AiProviderKey } from "../hooks/use-ai-config";
import { ChannelList, type ChannelListItem } from "./channel-list";
import { ModelCards } from "./model-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { getProviderKeyHealthStatus, getProviderKeyModelHealthStatus } from "@/lib/ai/provider-routing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PoolViewSwitcherProps {
  viewMode: "group" | "model" | "channel";
  onChange: (mode: "group" | "model" | "channel") => void;
}

export function PoolViewSwitcher({ viewMode, onChange }: PoolViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        aria-pressed={viewMode === "model"}
        aria-label="切换至模型视角"
        onClick={() => onChange("model")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-all cursor-pointer",
          viewMode === "model"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        模型视角
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "group"}
        aria-label="切换至分组视角"
        onClick={() => onChange("group")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-all cursor-pointer",
          viewMode === "group"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        分组视角
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "channel"}
        aria-label="切换至渠道视角"
        onClick={() => onChange("channel")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-all cursor-pointer",
          viewMode === "channel"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        渠道视角
      </button>
    </div>
  );
}

export interface ChannelPoolViewProps {
  bundle: AiConfigBundle | null;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onTestKey: (keyId: string) => Promise<unknown>;
  onTestModel: (keyId: string, modelId: string) => Promise<unknown>;
  onToggleModel: (modelId: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  onEditKey: (key: AiProviderKey) => void;
  onOpenAddKey: () => void;
}

export function GroupPoolView({
  bundle,
  onSyncKeyModels,
  onEditKey,
  onOpenAddKey,
}: Pick<ChannelPoolViewProps, "bundle" | "onSyncKeyModels" | "onEditKey" | "onOpenAddKey">) {
  const groups = useMemo(() => {
    if (!bundle) return [];
    const providers = new Map(bundle.providers.map((provider) => [provider.id, provider]));
    const byName = new Map<string, Array<{ provider: AiConfigBundle["providers"][number]; key: AiProviderKey; models: AiConfigBundle["models"] }>>();
    for (const key of bundle.keys) {
      const provider = providers.get(key.provider_id);
      if (!provider) continue;
      const name = key.label.trim().toLowerCase() || "未命名分组";
      const entry = { provider, key, models: bundle.models.filter((model) => model.key_id === key.id && model.is_enabled) };
      byName.set(name, [...(byName.get(name) ?? []), entry]);
    }
    return Array.from(byName.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [bundle]);

  // 获取模型健康状态
  const getModelHealth = (model: AiConfigBundle["models"][number]) => {
    const key = bundle?.keys.find((k) => k.id === model.key_id);
    if (!key?.is_enabled) return "paused";

    const keyHealth = getProviderKeyHealthStatus({
      isEnabled: key.is_enabled,
      lastSuccessAt: key.last_success_at,
      lastFailureAt: key.last_failure_at,
      unhealthyUntil: key.unhealthy_until,
    });
    if (keyHealth === "unhealthy" || keyHealth === "disabled") return "fault";

    const modelHealth = getProviderKeyModelHealthStatus({
      isEnabled: model.is_enabled,
      lastSuccessAt: model.last_success_at,
      lastFailureAt: model.last_failure_at,
      lastFailureScope: model.last_failure_scope === "key" ? "unknown" : model.last_failure_scope,
      unhealthyUntil: model.unhealthy_until,
    });

    return modelHealth === "disabled" || modelHealth === "unhealthy" ? "fault" : modelHealth === "untested" ? "untested" : "healthy";
  };

  return (
    <div className="space-y-3">
      {groups.length === 0 ? (
        <EmptyState title="暂无分组密钥" description="接入渠道并填写专线分组后，这里会按分组汇总。" action={{ label: "接入渠道", onClick: onOpenAddKey }} />
      ) : groups.map(([name, entries]) => (
        <div key={name} className="rounded-xl border border-[#E2E2DF] bg-white shadow-input overflow-hidden">
          <div className="px-4 py-2.5 bg-[#FCFCFB] border-b border-[#E2E2DF]/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-[#141413]">{name} 分组</span>
              <span className="text-[12px] text-[#78716C]">· {entries.length} 个渠道实例</span>
            </div>
          </div>
          <div className="divide-y divide-[#E2E2DF]/50">
            {entries.map(({ provider, key, models }) => {
              return (
                <div key={key.id} className="px-4 py-2.5 hover:bg-[#FAF9F6] transition-colors">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 渠道定位（前置，次要信息） */}
                    <span className="text-[13px] text-[#78716C]">
                      {key.label} ({provider.name})
                    </span>

                    <span className="text-[#E2E2DF] mx-1">·</span>

                    {/* 模型状态横向排列（前置，最重要） */}
                    {models.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {models.map((model) => {
                          const health = getModelHealth(model);
                          return (
                            <span
                              key={model.id}
                              className="inline-flex items-center gap-1.5"
                            >
                              <span className={cn(
                                "size-2 rounded-full shrink-0",
                                health === "healthy" ? "bg-[#6FAA7D]" :
                                health === "fault" ? "bg-[#C0685C]" :
                                health === "untested" ? "bg-[#B98A54]" : "bg-[#A8A29E]"
                              )} />
                              <span className="text-[13px] font-medium text-[#1F1E1D]">
                                {model.display_name || getModelDisplayName(model.model_id)}
                              </span>
                              <span className={cn(
                                "text-[12px]",
                                health === "healthy" ? "text-[#6FAA7D]" :
                                health === "fault" ? "text-[#C0685C]" :
                                health === "untested" ? "text-[#B98A54]" : "text-[#78716C]"
                              )}>
                                {health === "healthy" ? "运行中" :
                                 health === "fault" ? "故障" :
                                 health === "untested" ? "待测" : "已暂停"}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#A8A29E]">暂无已上架模型</span>
                    )}

                    {/* 操作按钮（右对齐） */}
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" size="s" onClick={() => onSyncKeyModels(key)} className="h-6.5 text-[12px]">同步</Button>
                      <Button variant="ghost" size="s" onClick={() => onEditKey(key)} className="h-6.5 text-[12px]">编辑</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChannelPoolView({
  bundle,
  onSyncKeyModels,
  onTestKey,
  onTestModel,
  onToggleModel,
  onEditKey,
  onOpenAddKey,
}: ChannelPoolViewProps) {
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const channels = useMemo<ChannelListItem[]>(() => {
    if (!bundle) return [];
    return bundle.keys
      .map((key) => ({
        ...key,
        providerName: bundle.providers.find((provider) => provider.id === key.provider_id)?.name ?? "未知供应商",
      }))
      .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
  }, [bundle]);

  const selectedChannel = channels.find((channel) => channel.id === selectedKeyId) ?? channels[0] ?? null;
  const selectedProvider = selectedChannel
    ? bundle?.providers.find((provider) => provider.id === selectedChannel.provider_id)
    : null;
  const selectedModels = selectedChannel
    ? (bundle?.models ?? []).filter((model) => model.key_id === selectedChannel.id)
    : [];
  const enabledModelIds = useMemo(
    () => new Set((bundle?.models ?? []).filter((model) => model.is_enabled).map((model) => model.model_id)),
    [bundle],
  );

  if (channels.length === 0) {
    return (
      <EmptyState
        className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
        title="暂无接入渠道"
        description="点击上方【接入渠道】绑定新服务商与密钥，开启智能算力供给。"
        action={{ label: "接入渠道", onClick: onOpenAddKey }}
      />
    );
  }

  const channelHealth = getProviderKeyHealthStatus({
    isEnabled: selectedChannel?.is_enabled ?? false,
    lastSuccessAt: selectedChannel?.last_success_at,
    lastFailureAt: selectedChannel?.last_failure_at,
    unhealthyUntil: selectedChannel?.unhealthy_until,
  });
  const channelStatusLabel = channelHealth === "disabled" ? "已禁用" : channelHealth === "unhealthy" ? "熔断中" : channelHealth === "untested" ? "待测" : "健康";

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E2DF] bg-white shadow-input">
      <div className="flex min-h-[560px] flex-col md:flex-row">
        <ChannelList channels={channels} selectedId={selectedChannel?.id ?? null} onSelect={setSelectedKeyId} />

        <section className="min-w-0 flex-1">
          {selectedChannel && (
            <>
              <header className="border-b border-[#E2E2DF]/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[17px] font-medium text-[#141413]">{selectedChannel.label}</h3>
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#78716C]">
                        <span className={cn(
                          "size-2 rounded-full",
                          channelHealth === "healthy" && "bg-[#6FAA7D]",
                          (channelHealth === "unhealthy" || channelHealth === "untested") && "bg-[#B98A54]",
                          channelHealth === "disabled" && "bg-[#A8A29E]",
                        )} />
                        {channelStatusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#78716C]">{selectedProvider?.name ?? selectedChannel.providerName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button type="button" variant="outline" size="s" className="h-7 text-[12px]" onClick={() => void onTestKey(selectedChannel.id)}>
                      检测渠道
                    </Button>
                    <Button type="button" size="s" className="h-7 bg-[#D97757] text-[12px] text-white hover:bg-[#D97757]/90" onClick={() => onSyncKeyModels(selectedChannel)}>
                      同步模型
                    </Button>
                    <Button type="button" variant="ghost" size="s" className="h-7 text-[12px]" onClick={() => onEditKey(selectedChannel)}>
                      编辑
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-[#E2E2DF]/70 bg-[#FCFCFB] p-3 text-[12px] sm:grid-cols-2">
                  <div className="min-w-0">
                    <span className="text-[#78716C]">API 密钥</span>
                    <code className="mt-1 block truncate font-mono text-[#1F1E1D]" title="出于安全原因仅显示脱敏值">
                      {selectedChannel.api_key_masked || "已配置（已隐藏）"}
                    </code>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[#78716C]">API 地址</span>
                    <code className="mt-1 block truncate font-mono text-[#1F1E1D]">{selectedProvider?.base_url || "未配置"}</code>
                  </div>
                </div>
              </header>

              <div className="space-y-3 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h4 className="text-[14px] font-medium text-[#141413]">模型列表</h4>
                    <p className="mt-1 text-[12px] text-[#78716C]">按名称排序，直接切换启用状态或检测连接。</p>
                  </div>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#78716C]">
                    {selectedModels.filter((model) => enabledModelIds.has(model.model_id)).length}/{selectedModels.length} 已启用
                  </span>
                </div>
                <ModelCards
                  models={selectedModels}
                  enabledModelIds={enabledModelIds}
                  onToggle={onToggleModel}
                  onTest={(modelId) => onTestModel(selectedChannel.id, modelId)}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
