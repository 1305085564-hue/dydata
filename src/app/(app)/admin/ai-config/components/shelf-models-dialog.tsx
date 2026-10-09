"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ModelFamilyKeyItem } from "./model-family-card";
import { formatLatency } from "@/lib/ai-config/presentation";

export interface DiscoveredModelItem {
  modelId: string;
  displayName: string;
}

export type WarehouseModelGroup = {
  modelId: string;
  displayName: string;
  items: ModelFamilyKeyItem[];
  isShelved: boolean;
};

export type KeyTestResultItem = {
  keyId: string;
  keyName: string;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

interface ShelfModelsPickerProps {
  activeInheritedModels: DiscoveredModelItem[];
  otherDiscoveredModels: DiscoveredModelItem[];
  selectedModelIds: Set<string>;
  onToggleModel: (modelId: string) => void;
  isProbeSuccess?: boolean;
}

export function ShelfModelsPicker({
  activeInheritedModels,
  otherDiscoveredModels,
  selectedModelIds,
  onToggleModel,
  isProbeSuccess = true,
}: ShelfModelsPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeInheritedModels;
    return activeInheritedModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
    );
  }, [activeInheritedModels, searchQuery]);

  const filteredOther = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return otherDiscoveredModels;
    return otherDiscoveredModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
    );
  }, [otherDiscoveredModels, searchQuery]);

  return (
    <div className="space-y-3.5">
      {/* 顶部搜索框（过滤全部发现模型） */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="按关键词搜索模型名称或标识..."
          className="h-8 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E] bg-white shadow-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* 区一：全站现役模型 · 自动继承上架 */}
      <div className="space-y-2 rounded-xl border border-[#E2E2DF] bg-[#FCFCFB]/60 p-3 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#141413]">
            全站现役模型 · 自动继承上架 ({activeInheritedModels.length})
          </span>
          <span className="text-[12px] text-[#6FAA7D] font-mono">
            {activeInheritedModels.filter((m) => selectedModelIds.has(m.modelId)).length} / {activeInheritedModels.length} 已选
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-[#78716C]">
          {isProbeSuccess
            ? "检测到此密钥支持网站正在使用的模型，已默认勾选，接入后自动作为备用算力源。"
            : "网站当前正在使用的现役模型，已默认勾选，接入后作为备用算力源。"}
        </p>

        {filteredActive.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-[#A8A29E]">
            {searchQuery ? "未找到匹配的现役模型" : "暂无可自动继承的现役模型"}
          </div>
        ) : (
          <div className="divide-y divide-[#E2E2DF]/60 max-h-40 overflow-y-auto rounded-lg border border-[#E2E2DF] bg-white">
            {filteredActive.map((item) => {
              const isChecked = selectedModelIds.has(item.modelId);
              return (
                <label
                  key={item.modelId}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#F7F7F6]/60 cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => onToggleModel(item.modelId)}
                    />
                    <span className="text-[13px] font-normal text-[#141413] truncate">
                      {item.displayName}
                    </span>
                    {item.displayName !== item.modelId && (
                      <span className="text-[12px] font-mono text-[#78716C] truncate">
                        ({item.modelId})
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-normal bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20 shrink-0">
                    全站使用中
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 区二：该渠道支持的其他模型 / 回退候选 */}
      <div className="space-y-2 rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#141413]">
            {isProbeSuccess
              ? `该渠道支持的其他可用模型 (${otherDiscoveredModels.length})`
              : `未直接探得上游 · 历史已知模型候选 (${otherDiscoveredModels.length})`}
          </span>
          <span className="text-[12px] text-[#78716C]">
            未勾选将作为储备存入仓库
          </span>
        </div>

        {filteredOther.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-[#A8A29E]">
            {searchQuery ? "未找到匹配的其他模型" : "未发现其他未上架模型"}
          </div>
        ) : (
          <div className="divide-y divide-[#E2E2DF]/60 max-h-48 overflow-y-auto rounded-lg border border-[#E2E2DF] bg-white">
            {filteredOther.map((item) => {
              const isChecked = selectedModelIds.has(item.modelId);
              return (
                <label
                  key={item.modelId}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#F7F7F6]/60 cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => onToggleModel(item.modelId)}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-normal truncate",
                        isChecked ? "text-[#141413] font-medium" : "text-[#78716C]"
                      )}
                    >
                      {item.displayName}
                    </span>
                    {item.displayName !== item.modelId && (
                      <span className="text-[12px] font-mono text-[#A8A29E] truncate">
                        ({item.modelId})
                      </span>
                    )}
                  </div>
                  {isChecked && (
                    <span className="text-[12px] font-normal text-[#1F1E1D] bg-[#F1F1F0] px-1.5 py-0.5 rounded-md shrink-0 border border-[#E2E2DF]/60">
                      接入后上架
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


interface KeyTestResultsBarProps {
  testResults: { total: number; results: KeyTestResultItem[] };
  onClose: () => void;
}

export function KeyTestResultsBar({ testResults, onClose }: KeyTestResultsBarProps) {
  const onlineCount = testResults.results.filter((r) => r.ok).length;
  const failureCount = testResults.total - onlineCount;
  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-card space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-[#141413]">
          <span className="font-medium">渠道连通测试结果</span>
          <span className="text-[12px] text-[#78716C]">
            （测了 {testResults.total} 个 · 通过 {onlineCount} 个 · 失败 {failureCount} 个）
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#78716C] hover:text-[#141413] p-1 rounded-md hover:bg-[#EBEBE9]"
          title="关闭结果条"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {testResults.results.map((r) => {
          const isTimeout = !r.ok && (r.error?.toLowerCase().includes("timeout") || r.error?.includes("超时"));
          return (
            <div
              key={r.keyId}
              className="flex items-center justify-between rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB] px-2.5 py-1.5 text-[12px]"
            >
              <span className="truncate max-w-[140px] text-[#141413] font-medium" title={r.keyName}>
                {r.keyName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {r.ok ? (
                  <>
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">
                      在线
                    </span>
                    <span className="text-[#78716C] font-mono">{r.latencyMs == null ? "—" : formatLatency(r.latencyMs)}</span>
                  </>
                ) : (
                  <span
                    className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-[#C0685C]/10 text-[#C0685C] border border-[#C0685C]/20"
                    title={r.error}
                  >
                    {isTimeout ? "超时" : "失败"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SyncFailedResultsBarProps {
  failedChannels: Array<{ keyName: string; error: string }>;
  onClose: () => void;
}

export function SyncFailedResultsBar({ failedChannels, onClose }: SyncFailedResultsBarProps) {
  return (
    <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-3.5 shadow-card space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-[#C0685C]">
          <span className="font-medium">未连通渠道手记</span>
          <span className="text-[12px]">({failedChannels.length} 个渠道探测异常)</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#C0685C] hover:bg-[#C0685C]/10 p-1 rounded-md"
          title="关闭"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {failedChannels.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start justify-between gap-2 rounded-lg border border-[#C0685C]/20 bg-white px-2.5 py-1.5 text-[12px]"
          >
            <span className="text-[#141413] shrink-0 max-w-[140px] truncate font-medium" title={item.keyName}>
              {item.keyName}
            </span>
            <span className="text-[#C0685C] text-right truncate text-[12px]" title={item.error}>
              {item.error || "探测失败"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
