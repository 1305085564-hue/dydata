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
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { cn } from "@/lib/utils";

export type ChannelStatusFilter = "all" | "fault" | "untested";

export interface PoolViewSwitcherProps {
  viewMode: "model" | "channel";
  onChange: (mode: "model" | "channel") => void;
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
  viewMode: "model" | "channel";
  onViewModeChange: (mode: "model" | "channel") => void;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onEditKey: (key: AiProviderKey) => void;
  onOpenAddKey: () => void;
  onRefresh?: () => Promise<unknown>;
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

  // 纯前端聚合渠道卡数据
  const providerGroups = useMemo<ProviderChannelGroup[]>(() => {
    if (!bundle) return [];
    const keyMap = new Map(bundle.keys.map((k) => [k.id, k])); // gate:transient-map useMemo内部查找索引，随渲染释放
    const shelvedModelIds = new Set(
      bundle.models.filter((m) => m.is_enabled).map((m) => m.model_id)
    );

    return bundle.providers.map((p) => {
      const keys = bundle.keys
        .filter((k) => k.provider_id === p.id)
        .sort((a, b) => a.priority - b.priority);

      const modelMap = new Map<string, ChannelModelItem>(); // gate:transient-map useMemo内部模型去重索引，随渲染释放
      for (const m of bundle.models) {
        const k = keyMap.get(m.key_id);
        if (k && k.provider_id === p.id) {
          if (!modelMap.has(m.model_id)) {
            modelMap.set(m.model_id, {
              modelId: m.model_id,
              displayName: m.display_name || getModelDisplayName(m.model_id),
              isShelved: shelvedModelIds.has(m.model_id),
              keyModelId: m.id,
            });
          }
        }
      }

      let healthyKeyCount = 0;
      let faultKeyCount = 0;
      let untestedKeyCount = 0;

      for (const k of keys) {
        if (!k.is_enabled) continue;
        const status = getProviderKeyHealthStatus({
          isEnabled: k.is_enabled,
          lastSuccessAt: k.last_success_at,
          lastFailureAt: k.last_failure_at,
          unhealthyUntil: k.unhealthy_until,
        });
        if (status === "healthy") healthyKeyCount++;
        else if (status === "unhealthy") faultKeyCount++;
        else untestedKeyCount++;
      }

      return {
        provider: p,
        keys,
        models: Array.from(modelMap.values()),
        stats: {
          totalKeys: keys.length,
          activeKeys: keys.filter((k) => k.is_enabled).length,
          healthyKeyCount,
          faultKeyCount,
          untestedKeyCount,
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
        const matchModel = g.models.some(
          (m) =>
            m.displayName.toLowerCase().includes(keyword) ||
            m.modelId.toLowerCase().includes(keyword)
        );
        if (!matchName && !matchKey && !matchModel) return false;
      }

      // 修正项 3：如实按三态筛选，不作假承诺
      if (statusFilter === "fault" && g.stats.faultKeyCount === 0) return false;
      if (statusFilter === "untested" && g.stats.untestedKeyCount === 0) return false;

      return true;
    });
  }, [providerGroups, searchText, statusFilter]);

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
      {/* 区段标题与视角切换器（对齐 T17 无障碍规范） */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-[#1F1E1D]">接入渠道与服务商</span>
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

          {/* 修正项 3：如实提供三态筛选，去除无可用渠道假承诺 */}
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
