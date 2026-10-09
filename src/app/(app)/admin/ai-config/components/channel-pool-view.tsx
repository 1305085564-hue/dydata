"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { AiConfigBundle, AiProviderKey } from "../hooks/use-ai-config";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { resolveModelDisplayName } from "@/lib/ai/model-families";
import { formatLatency } from "@/lib/ai-config/presentation";
import { cn } from "@/lib/utils";

export interface ChannelPoolViewProps {
  bundle: AiConfigBundle | null;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onTestKeyModel: (keyId: string, modelId: string) => Promise<unknown>;
  onTestKeyAllModels: (keyId: string) => Promise<void>;
  onToggleKeyEnable: (keyId: string, enabled: boolean) => Promise<boolean>;
  onRenameKey: (keyId: string, newLabel: string) => Promise<boolean>;
  onDeleteKeyWithCheck: (keyId: string) => void;
  onOpenManageProviders: () => void;
  onOpenAddKey: () => void;
  onToggleModelEnable: (modelRecordId: string, enabled: boolean) => Promise<boolean>;
  onUpdateKeyPriority: (keyId: string, priority: number) => Promise<boolean>;
  onUpdateKeyApiKey: (keyId: string, apiKey: string) => Promise<boolean>;
  onUpdateKeyProvider: (keyId: string, providerId: string) => Promise<boolean>;
  onUpdateProviderBaseUrl: (providerId: string, baseUrl: string) => Promise<boolean>;
}

export function ChannelPoolView({
  bundle,
  onSyncKeyModels,
  onTestKeyModel,
  onTestKeyAllModels,
  onToggleKeyEnable,
  onRenameKey,
  onDeleteKeyWithCheck,
  onOpenManageProviders,
  onOpenAddKey,
  onToggleModelEnable,
  onUpdateKeyPriority,
  onUpdateKeyApiKey,
  onUpdateKeyProvider,
  onUpdateProviderBaseUrl,
}: ChannelPoolViewProps) {
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [testingAllForChannel, setTestingAllForChannel] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelLatencies, setModelLatencies] = useState<
    Record<string, { ok: boolean; latencyMs?: number; message?: string }>
  >({});

  // 内联编辑状态
  const [editingField, setEditingField] = useState<"label" | "api_key" | "base_url" | "priority" | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);

  const channels = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.keys].sort((a, b) => a.priority - b.priority || (a.label || "").localeCompare(b.label || ""));
  }, [bundle]);

  const selectedChannel = useMemo(() => {
    if (channels.length === 0) return null;
    return channels.find((c) => c.id === selectedKeyId) ?? channels[0];
  }, [channels, selectedKeyId]);

  const selectedProvider = useMemo(() => {
    if (!selectedChannel || !bundle) return null;
    return bundle.providers.find((p) => p.id === selectedChannel.provider_id) ?? null;
  }, [selectedChannel, bundle]);

  const selectedModels = useMemo(() => {
    if (!selectedChannel || !bundle) return [];
    return bundle.models.filter((m) => m.key_id === selectedChannel.id);
  }, [selectedChannel, bundle]);

  if (channels.length === 0) {
    return (
      <EmptyState
        className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
        title="暂无接入渠道"
        description="点击上方【接入渠道】绑定新接入点与专线密钥，开启智能算力供给。"
        action={{ label: "接入渠道", onClick: onOpenAddKey }}
      />
    );
  }

  const selectedHealth = selectedChannel
    ? getProviderKeyHealthStatus({
        isEnabled: selectedChannel.is_enabled,
        lastSuccessAt: selectedChannel.last_success_at,
        lastFailureAt: selectedChannel.last_failure_at,
        unhealthyUntil: selectedChannel.unhealthy_until,
      })
    : "untested";

  const handleStartEdit = (field: "label" | "api_key" | "base_url" | "priority") => {
    setEditingField(field);
    if (field === "label") setEditingValue(selectedChannel?.label ?? "");
    else if (field === "api_key") setEditingValue("");
    else if (field === "base_url") setEditingValue(selectedProvider?.base_url ?? "");
    else if (field === "priority") setEditingValue(String(selectedChannel?.priority ?? 1));
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditingValue("");
  };

  const handleSaveEdit = async () => {
    if (!selectedChannel || !editingField || savingField) return;
    const trimmed = editingValue.trim();

    setSavingField(true);
    try {
      if (editingField === "label") {
        if (!trimmed) {
          feedbackToast.error("专线名称不能为空");
          return;
        }
        const ok = await onRenameKey(selectedChannel.id, trimmed);
        if (ok) {
          feedbackToast.success("已更新专线名称");
          setEditingField(null);
        }
      } else if (editingField === "api_key") {
        if (!trimmed) {
          feedbackToast.error("密钥不能为空");
          return;
        }
        const ok = await onUpdateKeyApiKey(selectedChannel.id, trimmed);
        if (ok) {
          feedbackToast.success("已更新 API 密钥");
          setEditingField(null);
        }
      } else if (editingField === "base_url") {
        if (!selectedProvider) return;
        if (!trimmed) {
          feedbackToast.error("API 地址不能为空");
          return;
        }
        try {
          new URL(trimmed);
        } catch {
          feedbackToast.error("请输入有效的 API 地址");
          return;
        }
        const ok = await onUpdateProviderBaseUrl(selectedProvider.id, trimmed);
        if (ok) {
          feedbackToast.success("已更新接入点 API 地址");
          setEditingField(null);
        }
      } else if (editingField === "priority") {
        const pNum = Number.parseInt(trimmed, 10);
        if (Number.isNaN(pNum) || pNum < 1 || pNum > 999) {
          feedbackToast.error("顺位权重必须为 1-999 的正整数");
          return;
        }
        const ok = await onUpdateKeyPriority(selectedChannel.id, pNum);
        if (ok) {
          feedbackToast.success("已更新专线顺位");
          setEditingField(null);
        }
      }
    } finally {
      setSavingField(false);
    }
  };

  const handleTestChannelAll = async () => {
    if (!selectedChannel || testingAllForChannel) return;
    setTestingAllForChannel(true);
    try {
      await onTestKeyAllModels(selectedChannel.id);
    } finally {
      setTestingAllForChannel(false);
    }
  };

  const handleTestSingleModel = async (modelId: string) => {
    if (!selectedChannel || testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = (await onTestKeyModel(selectedChannel.id, modelId)) as {
        ok: boolean;
        latencyMs?: number;
        message?: string;
      } | null;
      if (res) {
        setModelLatencies((prev) => ({ ...prev, [modelId]: res }));
      }
    } finally {
      setTestingModelId(null);
    }
  };

  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input flex flex-col md:flex-row min-h-[580px]">
      {/* 左侧：专线渠道列表 */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#E2E2DF]/70 bg-[#FCFCFB] flex flex-col shrink-0">
        <div className="px-3.5 py-2.5 border-b border-[#E2E2DF]/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Server className="size-3.5 text-[#D97757]" />
            <span className="text-[13px] font-medium text-[#1F1E1D]">专线渠道</span>
            <span className="text-[12px] text-[#78716C] font-mono">({channels.length})</span>
          </div>
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="s"
                    aria-label="管理接入点列表"
                    className="size-7 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                    onClick={onOpenManageProviders}
                  >
                    <Settings2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-[12px]">
                管理接入点列表
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="divide-y divide-[#E2E2DF]/40 overflow-y-auto flex-1 p-1 space-y-0.5">
          {channels.map((ch) => {
            const isSelected = selectedChannel?.id === ch.id;
            const prov = bundle?.providers.find((p) => p.id === ch.provider_id);
            const keyModels = bundle?.models.filter((m) => m.key_id === ch.id) ?? [];
            const enabledCount = keyModels.filter((m) => m.is_enabled).length;

            const health = getProviderKeyHealthStatus({
              isEnabled: ch.is_enabled,
              lastSuccessAt: ch.last_success_at,
              lastFailureAt: ch.last_failure_at,
              unhealthyUntil: ch.unhealthy_until,
            });

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelectedKeyId(ch.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all cursor-pointer flex flex-col gap-1",
                  isSelected
                    ? "bg-[#FAF9F6] shadow-xs border border-[#E2E2DF]"
                    : "hover:bg-[#F7F7F6] border border-transparent"
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[12px] font-medium text-[#78716C] px-1.5 py-0.2 rounded bg-[#F1F1F0] shrink-0">
                      P{ch.priority}
                    </span>
                    <span
                      className={cn(
                        "text-[13px] truncate",
                        isSelected ? "font-medium text-[#1F1E1D]" : "text-[#1F1E1D]"
                      )}
                    >
                      {ch.label || "未命名专线"}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "size-2 rounded-full shrink-0",
                      health === "healthy" && "bg-[#6FAA7D]",
                      health === "untested" && "bg-[#B98A54]",
                      health === "unhealthy" && "bg-[#C75D5D]",
                      health === "disabled" && "bg-[#A8A29E]"
                    )}
                    title={
                      health === "healthy"
                        ? "正常在线"
                        : health === "untested"
                          ? "待测"
                          : health === "unhealthy"
                            ? "异常熔断"
                            : "已停用"
                    }
                  />
                </div>
                <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                  <span className="truncate max-w-[130px]">{prov?.name || "未知接入点"}</span>
                  <span className="font-mono tabular-nums">{enabledCount}/{keyModels.length} 模型</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧：选中渠道工作台 */}
      {selectedChannel ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* 工作台顶部标题栏 */}
          <div className="border-b border-[#E2E2DF]/60 bg-[#FCFCFB] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {editingField === "label" ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      disabled={savingField}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                      className="h-7 rounded border border-[#D97757] bg-white px-2 text-[14px] text-[#1F1E1D] focus:outline-none"
                    />
                    <Button
                      variant="ghost"
                      size="s"
                      aria-label="保存专线名称"
                      className="size-7 p-0 text-[#2E7D32]"
                      onClick={handleSaveEdit}
                      disabled={savingField}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="s"
                      aria-label="取消重命名"
                      className="size-7 p-0 text-[#78716C]"
                      onClick={handleCancelEdit}
                      disabled={savingField}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="group/name flex items-center gap-1.5">
                    <h3 className="text-[14px] font-medium text-[#1F1E1D] truncate">
                      {selectedChannel.label || "未命名专线"}
                    </h3>
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              aria-label="修改专线名称"
                              className="size-6 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                              onClick={() => handleStartEdit("label")}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          修改专线名称
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                <span className="font-mono text-[12px] font-medium text-[#78716C] px-1.5 py-0.5 rounded bg-[#F1F1F0]">
                  P{selectedChannel.priority} 顺位
                </span>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-md",
                    selectedHealth === "healthy" && "bg-[#6FAA7D]/10 text-[#2E7D32]",
                    selectedHealth === "untested" && "bg-[#B98A54]/10 text-[#B98A54]",
                    selectedHealth === "unhealthy" && "bg-[#C75D5D]/10 text-[#C75D5D]",
                    selectedHealth === "disabled" && "bg-[#F1F1F0] text-[#78716C]"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      selectedHealth === "healthy" && "bg-[#6FAA7D]",
                      selectedHealth === "untested" && "bg-[#B98A54]",
                      selectedHealth === "unhealthy" && "bg-[#C75D5D]",
                      selectedHealth === "disabled" && "bg-[#A8A29E]"
                    )}
                  />
                  {selectedHealth === "healthy"
                    ? "正常在线"
                    : selectedHealth === "untested"
                      ? "待测"
                      : selectedHealth === "unhealthy"
                        ? "异常熔断"
                        : "已停用"}
                </span>
              </div>
            </div>

            {/* 顶部操作动作 */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="s"
                className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                disabled={testingAllForChannel}
                onClick={handleTestChannelAll}
                title="含未上架的模型"
                aria-label="检测此渠道全部模型"
              >
                {testingAllForChannel ? (
                  <Loader2 className="size-3 animate-spin mr-1 text-[#78716C]" />
                ) : (
                  <Activity className="size-3 mr-1 text-[#78716C]" />
                )}
                检测此渠道全部模型
              </Button>

              <Button
                size="s"
                className="h-7 text-[12px] gap-1 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal"
                onClick={() => onSyncKeyModels(selectedChannel)}
                title="打开全部模型清单"
                aria-label="同步模型"
              >
                <RefreshCw className="size-3" />
                同步模型
              </Button>

              <TooltipProvider delay={100}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="删除该渠道"
                        className="size-7 p-0 text-[#78716C] hover:text-[#C75D5D] hover:bg-[#C75D5D]/10"
                        onClick={() => onDeleteKeyWithCheck(selectedChannel.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent side="top" className="text-[12px]">
                    删除该渠道
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* 渠道基础配置卡片 */}
            <div className="rounded-lg border border-[#E2E2DF]/70 bg-[#FCFCFB] p-3 text-[12px] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. API 密钥 */}
                <div className="space-y-1">
                  <span className="text-[#78716C]">API 密钥</span>
                  {editingField === "api_key" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="password"
                        autoFocus
                        disabled={savingField}
                        value={editingValue}
                        placeholder="输入新密钥"
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="h-7 w-full rounded border border-[#D97757] bg-white px-2 font-mono text-[12px] text-[#1F1E1D] focus:outline-none"
                      />
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="保存密钥"
                        className="size-7 p-0 text-[#2E7D32]"
                        onClick={handleSaveEdit}
                        disabled={savingField}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="取消编辑密钥"
                        className="size-7 p-0 text-[#78716C]"
                        onClick={handleCancelEdit}
                        disabled={savingField}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1 bg-white border border-[#E2E2DF]/60 rounded px-2 py-1">
                      <code className="text-[#1F1E1D] font-mono truncate">
                        {selectedChannel.api_key_masked || "已配置（已隐藏）"}
                      </code>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="修改 API 密钥"
                        className="size-5 p-0 text-[#78716C] hover:text-[#1F1E1D]"
                        onClick={() => handleStartEdit("api_key")}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 2. API 地址 */}
                <div className="space-y-1">
                  <span className="text-[#78716C]">API 地址</span>
                  {editingField === "base_url" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="url"
                        autoFocus
                        disabled={savingField}
                        value={editingValue}
                        placeholder="https://api.example.com/v1"
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="h-7 w-full rounded border border-[#D97757] bg-white px-2 font-mono text-[12px] text-[#1F1E1D] focus:outline-none"
                      />
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="保存 API 地址"
                        className="size-7 p-0 text-[#2E7D32]"
                        onClick={handleSaveEdit}
                        disabled={savingField}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="取消编辑 API 地址"
                        className="size-7 p-0 text-[#78716C]"
                        onClick={handleCancelEdit}
                        disabled={savingField}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1 bg-white border border-[#E2E2DF]/60 rounded px-2 py-1">
                      <code className="text-[#1F1E1D] font-mono truncate">
                        {selectedProvider?.base_url || "未配置"}
                      </code>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="修改 API 地址"
                        className="size-5 p-0 text-[#78716C] hover:text-[#1F1E1D]"
                        onClick={() => handleStartEdit("base_url")}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 3. 顺位权重 */}
                <div className="space-y-1">
                  <span className="text-[#78716C]">顺位优先级 (数字越小越优先)</span>
                  {editingField === "priority" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        autoFocus
                        disabled={savingField}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="h-7 w-full rounded border border-[#D97757] bg-white px-2 font-mono text-[12px] text-[#1F1E1D] focus:outline-none"
                      />
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="保存优先级"
                        className="size-7 p-0 text-[#2E7D32]"
                        onClick={handleSaveEdit}
                        disabled={savingField}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="取消编辑优先级"
                        className="size-7 p-0 text-[#78716C]"
                        onClick={handleCancelEdit}
                        disabled={savingField}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1 bg-white border border-[#E2E2DF]/60 rounded px-2 py-1">
                      <span className="text-[#1F1E1D] font-mono">P{selectedChannel.priority}</span>
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label="修改顺位优先级"
                        className="size-5 p-0 text-[#78716C] hover:text-[#1F1E1D]"
                        onClick={() => handleStartEdit("priority")}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 4. 所属接入点 */}
                <div className="space-y-1">
                  <span className="text-[#78716C]">所属接入点</span>
                  <div className="flex items-center bg-white border border-[#E2E2DF]/60 rounded px-2 py-0.5">
                    <select
                      aria-label="切换接入点"
                      value={selectedChannel.provider_id}
                      onChange={(e) => void onUpdateKeyProvider(selectedChannel.id, e.target.value)}
                      className="w-full bg-transparent text-[12px] text-[#1F1E1D] focus:outline-none cursor-pointer"
                    >
                      {(bundle?.providers ?? []).map((prov) => (
                        <option key={prov.id} value={prov.id}>
                          {prov.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 渠道启用状态总开关 */}
              <div className="pt-2 border-t border-[#E2E2DF]/60 flex items-center justify-between">
                <div>
                  <span className="text-[13px] text-[#1F1E1D] font-normal">是否启用渠道</span>
                  <p className="text-[12px] text-[#78716C]">
                    关闭后，系统将彻底跳过该渠道，不参与任何业务的模型算力调度。
                  </p>
                </div>
                <Switch
                  aria-label="是否启用渠道"
                  checked={selectedChannel.is_enabled}
                  onCheckedChange={(checked) => void onToggleKeyEnable(selectedChannel.id, checked)}
                />
              </div>
            </div>

            {/* 挂载模型列表卡片 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[13px] font-medium text-[#1F1E1D]">挂载模型与生效状态</h4>
                  <p className="text-[12px] text-[#78716C]">
                    此渠道支持的模型系列，可独立启闭或试跑连通性。
                  </p>
                </div>
                <span className="text-[12px] font-mono tabular-nums text-[#78716C]">
                  {selectedModels.filter((m) => m.is_enabled).length}/{selectedModels.length} 已启用
                </span>
              </div>

              {selectedModels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#E2E2DF] p-6 text-center">
                  <p className="text-[12px] text-[#78716C]">此专线尚未挂载任何模型。</p>
                  <Button
                    variant="outline"
                    size="s"
                    className="mt-2 h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                    onClick={() => onSyncKeyModels(selectedChannel)}
                  >
                    立即同步模型
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-[#E2E2DF]/70 divide-y divide-[#E2E2DF]/50 overflow-hidden bg-white">
                  {selectedModels.map((m) => {
                    const testInfo = modelLatencies[m.model_id];
                    const isTesting = testingModelId === m.model_id;
                    const displayName = resolveModelDisplayName(m.display_name, m.model_id);

                    return (
                      <div
                        key={m.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#F7F7F6]/60 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-normal text-[#1F1E1D] truncate">
                              {displayName}
                            </span>
                            {testInfo && (
                              <span
                                className={cn(
                                  "text-[12px] font-mono",
                                  testInfo.ok ? "text-[#2E7D32]" : "text-[#C75D5D]"
                                )}
                              >
                                {testInfo.ok
                                  ? testInfo.latencyMs != null
                                    ? formatLatency(testInfo.latencyMs)
                                    : "正常"
                                  : "测试失败"}
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] font-mono text-[#78716C] truncate">
                            {m.model_id}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <TooltipProvider delay={100}>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="s"
                                    aria-label={`测试 ${displayName} 连通性`}
                                    className="size-7 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                                    disabled={isTesting}
                                    onClick={() => handleTestSingleModel(m.model_id)}
                                  >
                                    {isTesting ? (
                                      <Loader2 className="size-3.5 animate-spin text-[#78716C]" />
                                    ) : (
                                      <Activity className="size-3.5" />
                                    )}
                                  </Button>
                                }
                              />
                              <TooltipContent side="top" className="text-[12px]">
                                测试模型连通性
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <Switch
                            aria-label={`启用 ${displayName}`}
                            checked={m.is_enabled}
                            onCheckedChange={(checked) => void onToggleModelEnable(m.id, checked)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
