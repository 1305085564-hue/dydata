"use client";

import { useMemo, useState } from "react";
import type { AiConfigBundle, AiProviderKey } from "../hooks/use-ai-config";
import { ChannelList, type ChannelListItem } from "./channel-list";
import { ModelCards } from "./model-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pencil } from "lucide-react";

export interface PoolViewSwitcherProps {
  viewMode: "model" | "channel";
  onChange: (mode: "model" | "channel") => void;
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
  onUpdateKey: (data: Record<string, unknown>) => Promise<boolean>;
  onUpdateProvider: (data: Record<string, unknown>) => Promise<boolean>;
  onOpenManageProviders: () => void;
  onOpenAddKey: () => void;
}

export function ChannelPoolView({
  bundle,
  onSyncKeyModels,
  onTestKey,
  onTestModel,
  onToggleModel,
  onUpdateKey,
  onUpdateProvider,
  onOpenManageProviders,
  onOpenAddKey,
}: ChannelPoolViewProps) {
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"api_key" | "base_url" | "priority" | "label" | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editError, setEditError] = useState("");
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

  const beginEdit = (field: "api_key" | "base_url" | "priority" | "label") => {
    setEditingField(field);
    setEditError("");
    setEditingValue(field === "base_url" ? selectedProvider?.base_url ?? "" : field === "priority" ? String(selectedChannel?.priority ?? "") : field === "label" ? selectedChannel?.label ?? "" : "");
  };

  const saveEdit = async () => {
    if (!editingField || !selectedChannel || savingField) return;
    const value = editingValue.trim();
    if ((editingField === "api_key" || editingField === "label") && !value) { setEditError(editingField === "label" ? "分组名称不能为空" : "密钥不能为空"); return; }
    if (editingField === "base_url") {
      try { new URL(value); } catch { setEditError("请输入有效的 API 地址"); return; }
      if (!selectedProvider) return;
    }
    if (editingField === "priority" && (!/^[1-9]\d*$/.test(value) || Number(value) > 999)) { setEditError("优先级必须是 1-999 的正整数"); return; }
    setSavingField(true);
    const ok = editingField === "base_url"
      ? await onUpdateProvider({ id: selectedProvider!.id, base_url: value })
      : await onUpdateKey({ id: selectedChannel.id, ...(editingField === "priority" ? { priority: Number(value) } : editingField === "label" ? { label: value } : { api_key: value }) });
    setSavingField(false);
    if (ok) { setEditingField(null); setEditingValue(""); }
  };

  if (channels.length === 0) {
    return (
      <div>
        <EmptyState
          className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
          title="暂无接入渠道"
          description="点击上方【接入渠道】绑定新服务商与密钥，开启智能算力供给。"
          action={{ label: "接入渠道", onClick: onOpenAddKey }}
        />
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" size="s" className="h-7 text-[12px]" onClick={onOpenManageProviders}>管理供应商</Button>
        </div>
      </div>
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
                    <Button type="button" variant="ghost" size="s" className="h-7 text-[12px]" onClick={onOpenManageProviders}>管理供应商</Button>
                    <Button type="button" variant="outline" size="s" className="h-7 text-[12px]" onClick={() => void onTestKey(selectedChannel.id)}>
                      检测渠道
                    </Button>
                    <Button type="button" size="s" className="h-7 bg-[#D97757] text-[12px] text-white hover:bg-[#D97757]/90" onClick={() => onSyncKeyModels(selectedChannel)}>
                      同步模型
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-[#E2E2DF]/70 bg-[#FCFCFB] p-3 text-[12px] sm:grid-cols-3">
                  {[
                    ["label", "分组名称", selectedChannel.label],
                    ["api_key", "API 密钥", selectedChannel.api_key_masked || "已配置（已隐藏）"],
                    ["base_url", "API 地址", selectedProvider?.base_url || "未配置"],
                    ["priority", "优先级", String(selectedChannel.priority)],
                  ].map(([field, label, display]) => (
                    <div className="min-w-0" key={field}>
                      <span className="text-[#78716C]">{label}</span>
                      {editingField === field ? (
                        <input
                          autoFocus
                          type={field === "api_key" ? "password" : field === "priority" ? "number" : field === "label" ? "text" : "url"}
                          min={field === "priority" ? 1 : undefined}
                          max={field === "priority" ? 999 : undefined}
                          value={editingValue}
                          placeholder={field === "api_key" ? "输入新密钥" : field === "label" ? "输入分组名称" : undefined}
                          disabled={savingField}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => void saveEdit()}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setEditingField(null); setEditError(""); } }}
                          className="mt-1 h-7 w-full rounded-md border border-[#D97757] bg-white px-2 font-mono text-[12px] outline-none"
                        />
                      ) : (
                        <div className="mt-1 flex items-center gap-1">
                          <code className="block min-w-0 flex-1 truncate font-mono text-[#1F1E1D]">{display}</code>
                          <button type="button" onClick={() => beginEdit(field as "api_key" | "base_url" | "priority" | "label")} className="flex size-5 shrink-0 items-center justify-center rounded text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]" title={`编辑${label}`}><Pencil className="size-3" /></button>
                        </div>
                      )}
                      {editingField === field && editError && <p className="mt-1 text-[11px] text-[#C0685C]">{editError}</p>}
                      {field === "base_url" && <p className="mt-1 text-[11px] text-[#A8A29E]">修改会影响此供应商下的所有密钥</p>}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 rounded-md border border-[#E2E2DF]/60 bg-white px-2 py-1.5 sm:col-span-3">
                    <span className="shrink-0 text-[#78716C]">所属供应商</span>
                    <select aria-label="所属供应商" value={selectedChannel.provider_id} onChange={(e) => void onUpdateKey({ id: selectedChannel.id, provider_id: e.target.value })} className="min-w-0 flex-1 rounded border border-[#E2E2DF] bg-white px-2 py-1 text-[12px] text-[#1F1E1D]">
                      {(bundle?.providers ?? []).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-[#E2E2DF]/60 bg-white px-2 py-1.5 sm:col-span-3">
                    <span className="text-[#78716C]">是否启用分组</span>
                    <Switch aria-label="是否启用分组" checked={selectedChannel.is_enabled} onCheckedChange={(checked) => void onUpdateKey({ id: selectedChannel.id, is_enabled: checked })} />
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
