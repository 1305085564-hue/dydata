"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AiConfigBundle, AiProviderKey } from "../hooks/use-ai-config";
import {
  ProviderChannelCard,
  type ProviderChannelGroup,
  type ChannelModelItem,
} from "./provider-channel-card";
import type { KeyTestResultItem } from "./shelf-models-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { getProviderKeyHealthStatus, getProviderKeyModelHealthStatus } from "@/lib/ai/provider-routing";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ChannelStatusFilter = "all" | "fault" | "untested";

export interface PoolViewSwitcherProps {
  viewMode: "group" | "model" | "channel";
  onChange: (mode: "group" | "model" | "channel") => void;
}

export function PoolViewSwitcher({ viewMode, onChange }: PoolViewSwitcherProps) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-[#F1F1F0] border border-[#E2E2DF]/60 shrink-0">
      <button
        type="button"
        aria-pressed={viewMode === "model"}
        aria-label="切换至模型视角"
        onClick={() => onChange("model")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-all",
          viewMode === "model"
            ? "bg-white text-[#141413] shadow-sm font-medium"
            : "text-[#78716C] hover:text-[#141413] font-normal"
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
          "text-[12px] px-2.5 py-1 rounded-md transition-all",
          viewMode === "group" ? "bg-white text-[#141413] shadow-sm font-medium" : "text-[#78716C] hover:text-[#141413] font-normal"
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
          "text-[12px] px-2.5 py-1 rounded-md transition-all",
          viewMode === "channel"
            ? "bg-white text-[#141413] shadow-sm font-medium"
            : "text-[#78716C] hover:text-[#141413] font-normal"
        )}
      >
        渠道视角
      </button>
    </div>
  );
}

export interface ChannelPoolViewProps {
  bundle: AiConfigBundle | null;
  viewMode: "group" | "model" | "channel";
  onViewModeChange: (mode: "group" | "model" | "channel") => void;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onEditKey: (key: AiProviderKey) => void;
  onOpenAddKey: () => void;
  onRefresh?: () => Promise<unknown>;
}

export function GroupPoolView({
  bundle,
  onSyncKeyModels,
  onEditKey,
  onOpenAddKey,
  onViewModeChange,
}: Pick<ChannelPoolViewProps, "bundle" | "onSyncKeyModels" | "onEditKey" | "onOpenAddKey" | "onViewModeChange">) {
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

  // 获取密钥健康状态
  const getKeyHealth = (key: AiProviderKey) => {
    const status = getProviderKeyHealthStatus({
      isEnabled: key.is_enabled,
      lastSuccessAt: key.last_success_at,
      lastFailureAt: key.last_failure_at,
      unhealthyUntil: key.unhealthy_until,
    });
    return status === "healthy" ? "healthy" : status === "unhealthy" ? "fault" : "untested";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <span className="text-[14px] font-medium text-[#1F1E1D]">分组视角</span>
          <span className="ml-2 text-[12px] text-[#78716C]">按业务分组横向对比各渠道供给</span>
        </div>
        <PoolViewSwitcher viewMode="group" onChange={onViewModeChange} />
      </div>
      {groups.length === 0 ? (
        <EmptyState title="暂无分组密钥" description="接入渠道并填写专线分组后，这里会按分组汇总。" action={{ label: "接入渠道", onClick: onOpenAddKey }} />
      ) : groups.map(([name, entries]) => (
        <div key={name} className="rounded-xl border border-[#E2E2DF] bg-white shadow-input overflow-hidden">
          <div className="px-4 py-3 bg-[#FAF9F6] border-b border-[#E2E2DF]/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-[#141413]">{name} 分组</span>
              <span className="text-[12px] text-[#A8A29E]">{entries.length} 个渠道实例</span>
            </div>
          </div>
          <div className="divide-y divide-[#E2E2DF]/50">
            {entries.map(({ provider, key, models }) => {
              const keyHealth = getKeyHealth(key);
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
  viewMode,
  onViewModeChange,
  onSyncKeyModels,
  onEditKey,
  onOpenAddKey,
  onRefresh,
}: ChannelPoolViewProps) {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChannelStatusFilter>("all");
  const [channelTesting, setChannelTesting] = useState<Record<string, boolean>>({});
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [inlineResults, setInlineResults] = useState<Record<string, KeyTestResultItem>>({});

  // 纯前端聚合渠道卡数据（修正 1：只列已上架模型，与模型视角现役池同源同集合）
  const providerGroups = useMemo<ProviderChannelGroup[]>(() => {
    if (!bundle) return [];
    return bundle.providers.map((p) => {
      const keys = bundle.keys
        .filter((k) => k.provider_id === p.id)
        .sort((a, b) => a.priority - b.priority);
      const modelsByKey: Record<string, ChannelModelItem[]> = {};
      for (const model of bundle.models) {
        if (!model.is_enabled) continue;
        const key = keys.find((candidate) => candidate.id === model.key_id);
        if (!key) continue;
        (modelsByKey[key.id] ??= []).push({
          modelId: model.model_id,
          displayName: model.display_name || getModelDisplayName(model.model_id),
          keyModelId: model.id,
          keyIds: [key.id],
          health: (() => {
            const keyHealth = getProviderKeyHealthStatus({ isEnabled: key.is_enabled, lastSuccessAt: key.last_success_at, lastFailureAt: key.last_failure_at, unhealthyUntil: key.unhealthy_until });
            if (keyHealth === "unhealthy" || keyHealth === "disabled") return "fault" as const;
            const modelHealth = getProviderKeyModelHealthStatus({ isEnabled: model.is_enabled, lastSuccessAt: model.last_success_at, lastFailureAt: model.last_failure_at, lastFailureScope: model.last_failure_scope === "key" ? "unknown" : model.last_failure_scope, unhealthyUntil: model.unhealthy_until });
            return modelHealth === "disabled" || modelHealth === "unhealthy" ? "fault" as const : modelHealth;
          })(),
        });
      }

      return {
        provider: p,
        keys,
        models: bundle.models
          .filter((model) => model.is_enabled && keys.some((key) => key.id === model.key_id))
          .reduce<ChannelModelItem[]>((items, model) => {
            if (!items.some((item) => item.modelId === model.model_id)) {
              items.push({ modelId: model.model_id, displayName: model.display_name || getModelDisplayName(model.model_id), keyModelId: model.id, keyIds: [model.key_id], health: "untested" });
            }
            return items;
          }, []),
        modelsByKey,
        stats: {
          totalKeys: keys.length,
          activeKeys: keys.filter((k) => k.is_enabled).length,
        },
      };
    });
  }, [bundle]);

  const filteredGroups = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return providerGroups.filter((g) => {
      if (keyword) {
        const matchName = g.provider.name.toLowerCase().includes(keyword);
        const matchKey = g.keys.some((k) => k.label.toLowerCase().includes(keyword));
        const matchModel = bundle?.models.some((m) => {
          const key = bundle.keys.find((candidate) => candidate.id === m.key_id);
          return key && key.provider_id === g.provider.id && (m.display_name || m.model_id).toLowerCase().includes(keyword);
        });
        if (!matchName && !matchKey && !matchModel) return false;
      }

      // 修正 3：按 health 三态如实筛选
      if (statusFilter !== "all") {
        const hasFault = g.keys.some((k) => {
          if (!k.is_enabled) return false;
          const inline = inlineResults[k.id];
          if (inline) return !inline.ok;
          return (
            getProviderKeyHealthStatus({
              isEnabled: k.is_enabled,
              lastSuccessAt: k.last_success_at,
              lastFailureAt: k.last_failure_at,
              unhealthyUntil: k.unhealthy_until,
            }) === "unhealthy"
          );
        });

        const hasUntested = g.keys.some((k) => {
          if (!k.is_enabled) return false;
          const inline = inlineResults[k.id];
          if (inline) return false;
          return (
            getProviderKeyHealthStatus({
              isEnabled: k.is_enabled,
              lastSuccessAt: k.last_success_at,
              lastFailureAt: k.last_failure_at,
              unhealthyUntil: k.unhealthy_until,
            }) === "untested"
          );
        });

        if (statusFilter === "fault" && !hasFault) return false;
        if (statusFilter === "untested" && !hasUntested) return false;
      }

      return true;
    });
  }, [providerGroups, searchText, statusFilter, inlineResults, bundle]);

  const hasActiveFilters = searchText.trim() !== "" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("all");
  };

  // R3: 渠道一键测试（并发度 ≤ 5，结果内联呈现，全流程 ≤ 1 条 Toast）
  const handleTestChannel = async (providerId: string, activeKeys: AiProviderKey[]) => {
    if (activeKeys.length === 0 || channelTesting[providerId]) return;

    setChannelTesting((prev) => ({ ...prev, [providerId]: true }));
    const providerName =
      providerGroups.find((g) => g.provider.id === providerId)?.provider.name || "渠道";

    let okCount = 0;
    let failCount = 0;

    const concurrency = 5;
    for (let i = 0; i < activeKeys.length; i += concurrency) {
      const chunk = activeKeys.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (key) => {
          try {
            const res = await fetchWithTimeout("/api/admin/ai-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "test_key", data: { key_id: key.id } }),
            });
            const data = await res.json();
            const tr: KeyTestResultItem = data.testResult || {
              keyId: key.id,
              keyName: key.label,
              ok: res.ok,
              latencyMs: 0,
              error: res.ok ? undefined : data.error || "请求失败",
            };
            setInlineResults((prev) => ({ ...prev, [key.id]: tr }));
            if (tr.ok) okCount++;
            else failCount++;
          } catch (err) {
            failCount++;
            setInlineResults((prev) => ({
              ...prev,
              [key.id]: {
                keyId: key.id,
                keyName: key.label,
                ok: false,
                latencyMs: 0,
                error: err instanceof Error ? err.message : "网络异常",
              },
            }));
          }
        })
      );
    }

    setChannelTesting((prev) => ({ ...prev, [providerId]: false }));

    if (failCount === 0) {
      feedbackToast.success(`【${providerName}】测试完成：${okCount}/${activeKeys.length} 个密钥在线`);
    } else {
      feedbackToast.warning(
        `【${providerName}】测试完成：${okCount}/${activeKeys.length} 个密钥在线，${failCount} 个异常`
      );
    }

    if (onRefresh) void onRefresh();
  };

  const handleTestSingleKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_key", data: { key_id: keyId } }),
      });
      const data = await res.json();
      const tr: KeyTestResultItem = data.testResult || {
        keyId,
        keyName: "密钥",
        ok: res.ok,
        latencyMs: 0,
        error: res.ok ? undefined : data.error || "请求失败",
      };
      setInlineResults((prev) => ({ ...prev, [keyId]: tr }));
      if (tr.ok) {
        feedbackToast.success(`测试通过 · 响应耗时 ${tr.latencyMs ?? 0}ms`);
      } else {
        feedbackToast.error(`测试未通过: ${tr.error || "异常"}`);
      }
    } catch (err) {
      setInlineResults((prev) => ({
        ...prev,
        [keyId]: {
          keyId,
          keyName: "密钥",
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : "网络异常",
        },
      }));
      feedbackToast.error("连通测试网络异常");
    } finally {
      setTestingKeyId(null);
      if (onRefresh) void onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      {/* 修正 4：区段标题统一为「渠道管理」，对仗「模型管理」 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-[#1F1E1D]">渠道管理</span>
          <span className="text-[12px] text-[#78716C]">
            {hasActiveFilters
              ? `(筛选出 ${filteredGroups.length}/${providerGroups.length} 家)`
              : `(共 ${providerGroups.length} 家接入)`}
          </span>
        </div>

        <PoolViewSwitcher viewMode={viewMode} onChange={onViewModeChange} />
      </div>

      {/* 筛选栏 */}
      {providerGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索渠道、密钥或模型"
              className="h-8 w-52 rounded-md border border-[#E2E2DF] bg-white pl-7 pr-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[12px] placeholder:text-[#A8A29E] transition-colors focus:border-[#78716C] focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ChannelStatusFilter)}
            className="h-8 w-fit rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input transition-colors focus:border-[#78716C] focus:outline-none"
          >
            <option value="all">全部状态</option>
            <option value="fault">仅含故障密钥</option>
            <option value="untested">仅含待测密钥</option>
          </select>
        </div>
      )}

      {/* 空态与列表 */}
      {providerGroups.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
          title="暂无接入渠道"
          description="点击上方【接入渠道】绑定新服务商与密钥，开启智能算力供给。"
          action={{ label: "接入渠道", onClick: onOpenAddKey }}
        />
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
          title="没有符合筛选条件的渠道"
          description="换个关键词，或清除筛选查看全部渠道。"
          action={{ label: "清除筛选", onClick: clearFilters }}
        />
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <ProviderChannelCard
              key={group.provider.id}
              group={group}
              testing={Boolean(channelTesting[group.provider.id])}
              testingKeyId={testingKeyId}
              inlineResults={inlineResults}
              onTestChannel={handleTestChannel}
              onTestKey={handleTestSingleKey}
              onSyncKeyModels={onSyncKeyModels}
              onEditKey={onEditKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
