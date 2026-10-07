"use client";

import { useMemo, useState } from "react";
import type { AiProviderKey } from "../hooks/use-ai-config";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";
import { cn } from "@/lib/utils";

export type ChannelListItem = AiProviderKey & { providerName: string };

interface ChannelListProps {
  channels: ChannelListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getStatus(channel: AiProviderKey) {
  const health = getProviderKeyHealthStatus({
    isEnabled: channel.is_enabled,
    lastSuccessAt: channel.last_success_at,
    lastFailureAt: channel.last_failure_at,
    unhealthyUntil: channel.unhealthy_until,
  });

  if (health === "disabled") return { tone: "disabled" as const, label: "已禁用" };
  if (health === "unhealthy") return { tone: "unhealthy" as const, label: "熔断中" };
  if (health === "untested") return { tone: "untested" as const, label: "待测" };
  return { tone: "healthy" as const, label: "健康" };
}

export function ChannelList({ channels, selectedId, onSelect }: ChannelListProps) {
  const [searchText, setSearchText] = useState("");
  const sortedChannels = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return [...channels]
      .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
      .filter((channel) => {
        if (!keyword) return true;
        return `${channel.label} ${channel.providerName}`.toLowerCase().includes(keyword);
      });
  }, [channels, searchText]);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[#E2E2DF] bg-[#FCFCFB] md:w-60 md:border-b-0 md:border-r">
      <div className="space-y-2 border-b border-[#E2E2DF]/70 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-[#141413]">渠道列表</h3>
          <span className="text-[12px] tabular-nums text-[#A8A29E]">{channels.length}</span>
        </div>
        {channels.length > 5 && (
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索渠道"
            aria-label="搜索渠道"
            className="h-8 w-full rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[12px] text-[#1F1E1D] shadow-input outline-none placeholder:text-[#A8A29E] focus:border-[#78716C]"
          />
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto p-2 md:block md:space-y-1 md:overflow-x-visible md:overflow-y-auto md:p-2.5">
        {sortedChannels.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-[#A8A29E]">没有符合条件的渠道</p>
        ) : (
          sortedChannels.map((channel) => {
            const status = getStatus(channel);
            const isSelected = selectedId === channel.id;
            return (
              <button
                key={channel.id}
                type="button"
                data-channel-id={channel.id}
                onClick={() => onSelect(channel.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-w-44 shrink-0 items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors md:w-full md:min-w-0",
                  isSelected ? "bg-[#EBEBE9]" : "hover:bg-[#F1F1F0]",
                )}
              >
                <span
                  aria-label={status.label}
                  title={status.label}
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    status.tone === "healthy" && "bg-[#6FAA7D]",
                    (status.tone === "unhealthy" || status.tone === "untested") && "bg-[#B98A54]",
                    status.tone === "disabled" && "bg-[#A8A29E]",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#1F1E1D]">{channel.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#78716C]">
                    {channel.providerName} · 优先级 {channel.priority}
                  </span>
                </span>
                <span className="sr-only">{status.label}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
