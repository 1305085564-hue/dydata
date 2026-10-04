"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Activity, Loader2, Zap, Pause, RotateCcw } from "lucide-react";
import type { AiProvider, AiProviderKey } from "../hooks/use-ai-config";
import type { KeyTestResultItem } from "./shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

export interface ChannelModelItem {
  modelId: string;
  displayName: string;
  isShelved: boolean;
  keyModelId: string;
}

export interface ProviderChannelGroup {
  provider: AiProvider;
  keys: AiProviderKey[];
  models: ChannelModelItem[];
  stats: {
    totalKeys: number;
    activeKeys: number;
    healthyKeyCount: number;
    faultKeyCount: number;
    untestedKeyCount: number;
  };
}

export interface ProviderChannelCardProps {
  group: ProviderChannelGroup;
  testing: boolean;
  testingKeyId: string | null;
  inlineResults: Record<string, KeyTestResultItem>;
  onTestChannel: (providerId: string, keys: AiProviderKey[]) => void;
  onTestKey: (keyId: string) => void;
  onSyncKeyModels: (key: AiProviderKey) => void;
  onEditKey: (key: AiProviderKey) => void;
}

function formatLatency(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ProviderChannelCard({
  group,
  testing,
  testingKeyId,
  inlineResults,
  onTestChannel,
  onTestKey,
  onSyncKeyModels,
  onEditKey,
}: ProviderChannelCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { provider, keys, models, stats } = group;

  const activeKeys = keys.filter((k) => k.is_enabled);

  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input transition-all">
      {/* 卡头（可折叠、无障碍可访问） */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 bg-white hover:bg-[#FAF9F6] transition-colors cursor-pointer select-none"
      >
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="text-[#78716C] p-0.5">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>

          <span className="text-[14px] font-medium text-[#141413]">
            {provider.name}
          </span>

          {/* 汇总元数据徽标（中性灰底） */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
            {stats.activeKeys}/{stats.totalKeys} 个密钥启用
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
            {models.length} 个在册模型
          </span>

          {/* 健康状态总览 */}
          {stats.faultKeyCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#C0685C]/10 text-[#C0685C]">
              <span className="size-1.5 rounded-full bg-[#C0685C]" />
              {stats.faultKeyCount} 处故障
            </span>
          ) : stats.healthyKeyCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#6FAA7D]/10 text-[#6FAA7D]">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              全部在线
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
              <span className="size-1.5 rounded-full bg-[#A8A29E]" />
              待命中
            </span>
          )}
        </div>

        {/* 卡头操作组（阻止冒泡） */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
            {testing ? "测试中..." : "测试本渠道"}
          </Button>
        </div>
      </div>

      {/* 展开卡身 */}
      {expanded && (
        <div className="border-t border-[#E2E2DF]/60 bg-white">
          {/* 第 1 段：密钥与连通性 */}
          <div className="px-3.5 py-1.5 bg-[#FAF9F6] border-b border-[#E2E2DF]/40 text-[12px] font-medium text-[#78716C]">
            密钥与连通状态
          </div>

          <div className="divide-y divide-[#E2E2DF]/40">
            {keys.length === 0 ? (
              <div className="px-4 py-3 text-[12px] text-[#A8A29E]">
                该服务商尚未添加密钥
              </div>
            ) : (
              keys.map((key) => {
                const health = getProviderKeyHealthStatus({
                  isEnabled: key.is_enabled,
                  lastSuccessAt: key.last_success_at,
                  lastFailureAt: key.last_failure_at,
                  unhealthyUntil: key.unhealthy_until,
                });
                const isTestingKey = testingKeyId === key.id;
                const result = inlineResults[key.id];

                return (
                  <div
                    key={key.id}
                    data-key-id={key.id}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 transition-colors",
                      key.is_enabled ? "hover:bg-[#FAF9F6]" : "bg-[#FAFAFA] text-[#A8A29E]"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C] border border-[#E2E2DF]/60">
                        P{key.priority}
                      </span>

                      {key.is_enabled ? (
                        <Zap className="size-3 text-[#D97757] fill-[#D97757]" />
                      ) : (
                        <Pause className="size-3 text-[#A8A29E]" />
                      )}

                      {/* T25 契约：主行只显「标签」，掩码走 title 悬停与 sr-only，不平铺 */}
                      <span
                        className="text-[13px] font-medium text-[#1F1E1D] truncate max-w-[200px]"
                        title={key.api_key_masked ? `密钥：${key.api_key_masked}` : undefined}
                      >
                        {key.label}
                      </span>
                      {key.api_key_masked && (
                        <span className="sr-only">密钥 {key.api_key_masked}</span>
                      )}

                      <span className="text-[#E2E2DF]">·</span>

                      {/* 同源健康三态 */}
                      {health === "healthy" ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#6FAA7D]">
                          <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                          健康
                        </span>
                      ) : health === "unhealthy" ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#C0685C]">
                          <span className="size-1.5 rounded-full bg-[#C0685C]" />
                          故障
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#78716C]">
                          <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                          待命中
                        </span>
                      )}

                      {/* R3 内联测试结果 */}
                      {isTestingKey ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#78716C]">
                          <Loader2 className="size-3 animate-spin" />
                          检测中
                        </span>
                      ) : result ? (
                        result.ok ? (
                          <span className="text-[12px] font-mono text-[#6FAA7D] inline-flex items-center gap-1">
                            ✓ {result.latencyMs != null ? formatLatency(result.latencyMs) : "正常"}
                          </span>
                        ) : (
                          <span
                            className="text-[12px] text-[#C0685C] truncate max-w-[160px] inline-flex items-center gap-1"
                            title={result.error || "测试失败"}
                          >
                            ✗ {result.error || "失败"}
                          </span>
                        )
                      ) : null}
                    </div>

                    {/* 密钥操作 */}
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => onSyncKeyModels(key)}
                        className="h-6.5 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] px-2 font-normal"
                      >
                        同步模型
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        disabled={isTestingKey || !key.is_enabled}
                        onClick={() => onTestKey(key.id)}
                        className="h-6.5 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] px-2 font-normal"
                      >
                        {isTestingKey ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                        测试
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => onEditKey(key)}
                        className="h-6.5 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] px-2 font-normal"
                      >
                        编辑
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 第 2 段：供给在册模型 (只读 R5) */}
          <div className="px-3.5 py-1.5 bg-[#FAF9F6] border-y border-[#E2E2DF]/40 text-[12px] font-medium text-[#78716C]">
            供给在册模型 ({models.length})
          </div>

          <div className="p-3.5 bg-white">
            {models.length === 0 ? (
              <div className="text-[12px] text-[#A8A29E]">
                该渠道尚未配置供给任何模型，可点击上方「同步模型」快速发现并上架。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {models.map((m) => (
                  <div
                    key={m.modelId}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[#E2E2DF]/60 bg-[#FAF9F6]/40 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-normal text-[#1F1E1D] truncate">
                        {m.displayName}
                      </div>
                      <div className="text-[12px] font-mono text-[#78716C] truncate">
                        {m.modelId}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-normal shrink-0",
                        m.isShelved
                          ? "bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20"
                          : "bg-[#F1F1F0] text-[#78716C]"
                      )}
                    >
                      {m.isShelved ? "已上架" : "未上架"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* R5 只读引导微文案 */}
          <div className="px-3.5 py-2 bg-[#FAFAFA] border-t border-[#E2E2DF]/40 text-[12px] text-[#A8A29E]">
            💡 渠道视角仅供连通性核验与模型清单盘点；调整模型上架与调度顺位请前往【模型视角】。
          </div>
        </div>
      )}
    </div>
  );
}
