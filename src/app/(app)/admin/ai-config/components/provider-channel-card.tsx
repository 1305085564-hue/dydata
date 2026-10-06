"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Activity, Loader2 } from "lucide-react";
import type { AiProvider, AiProviderKey } from "../hooks/use-ai-config";
import type { KeyTestResultItem } from "./shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

export interface ChannelModelItem {
  modelId: string;
  displayName: string;
  keyModelId: string;
  keyIds: string[];
  health: "healthy" | "fault" | "untested" | "unknown";
}

export interface ProviderChannelGroup {
  provider: AiProvider;
  keys: AiProviderKey[];
  models: ChannelModelItem[];
  modelsByKey: Record<string, ChannelModelItem[]>;
  stats: {
    totalKeys: number;
    activeKeys: number;
  };
}

export interface ProviderChannelCardProps {
  group: ProviderChannelGroup;
  testing: boolean;
  inlineResults: Record<string, KeyTestResultItem>;
  onTestChannel: (providerId: string, keys: AiProviderKey[]) => void;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onEditKey: (key: AiProviderKey) => void;
}

export function ProviderChannelCard({
  group,
  testing,
  inlineResults,
  onTestChannel,
  onSyncKeyModels,
  onEditKey,
}: ProviderChannelCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { provider, keys, models, modelsByKey, stats } = group;

  const activeKeys = keys.filter((k) => k.is_enabled);

  // 判定各个密钥状态（优先内联测试最新反馈，次选同源持久化状态）
  const getKeyHealth = (k: AiProviderKey) => {
    const inline = inlineResults[k.id];
    if (inline) {
      return inline.ok ? "healthy" : "fault";
    }
    const status = getProviderKeyHealthStatus({
      isEnabled: k.is_enabled,
      lastSuccessAt: k.last_success_at,
      lastFailureAt: k.last_failure_at,
      unhealthyUntil: k.unhealthy_until,
    });
    return status === "healthy" ? "healthy" : status === "unhealthy" ? "fault" : "untested";
  };

  const healthyKeys = activeKeys.filter((k) => getKeyHealth(k) === "healthy");
  const faultKeys = activeKeys.filter((k) => getKeyHealth(k) === "fault");
  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input transition-all">
      {/* 卡头 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 bg-[#FCFCFB] border-b border-[#E2E2DF]/60">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="text-[13px] font-medium text-[#141413]">
            {provider.name}
          </span>

          {/* 汇总徽章 */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
            {stats.activeKeys}/{stats.totalKeys} 个密钥
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
            {models.length} 个模型
          </span>

          {/* 健康状态汇总 */}
          {healthyKeys.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#6FAA7D]/10 text-[#6FAA7D]">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              {healthyKeys.length} 在线
            </span>
          )}
          {faultKeys.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#C0685C]/10 text-[#C0685C]">
              <span className="size-1.5 rounded-full bg-[#C0685C]" />
              {faultKeys.length} 故障
            </span>
          )}
        </div>

        {/* 卡头操作 */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="s"
            disabled={testing || activeKeys.length === 0}
            onClick={() => onTestChannel(provider.id, activeKeys)}
            className="h-7 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
          >
            {testing ? (
              <Loader2 className="size-3.5 mr-1 animate-spin text-[#78716C]" />
            ) : (
              <Activity className="size-3.5 mr-1 text-[#78716C]" />
            )}
            {testing ? "测试中..." : "测试"}
          </Button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[#78716C] hover:text-[#141413] p-0.5"
            aria-label={expanded ? "收起" : "展开"}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="divide-y divide-[#E2E2DF]/50">
          {keys.length === 0 ? (
            <div className="px-3.5 py-3 text-[12px] text-[#A8A29E]">
              该服务商暂无密钥
            </div>
          ) : (
            keys.map((key) => {
              const keyModels = modelsByKey[key.id] ?? [];

              return (
                <div key={key.id} className="px-3.5 py-2.5 hover:bg-[#FCFCFB] transition-colors">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C]">
                      P{key.priority}
                    </span>
                    <span className="text-[13px] text-[#78716C]">{key.label}</span>
                    <span className="text-[#E2E2DF] mx-0.5">·</span>
                    {keyModels.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {keyModels.map((m) => (
                          <span key={`${key.id}-${m.modelId}`} className="inline-flex items-center gap-1.5">
                            <span className={cn(
                              "size-2 rounded-full shrink-0",
                              m.health === "healthy" ? "bg-[#6FAA7D]" :
                              m.health === "fault" ? "bg-[#C0685C]" : "bg-[#A8A29E]"
                            )} />
                            <span className="text-[13px] font-medium text-[#1F1E1D]">{m.displayName}</span>
                            <span className={cn(
                              "text-[12px]",
                              m.health === "healthy" ? "text-[#6FAA7D]" :
                              m.health === "fault" ? "text-[#C0685C]" : "text-[#78716C]"
                            )}>
                              {m.health === "healthy" ? "运行中" : m.health === "fault" ? "故障" : "待测"}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#A8A29E]">暂无已上架模型</span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" size="s" onClick={() => onSyncKeyModels(key)} className="h-6.5 px-2 text-[12px]">
                        同步
                      </Button>
                      <Button variant="ghost" size="s" onClick={() => onEditKey(key)} className="h-6.5 px-2 text-[12px]">
                        编辑
                      </Button>
                    </div>
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
