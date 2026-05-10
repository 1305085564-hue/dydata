"use client";

import { Plus, ShieldAlert } from "lucide-react";
import { AiChannelRow } from "./types";
import { getStatus } from "./utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChannelSidebarProps {
  channels: AiChannelRow[];
  selectedChannelId: string | null;
  onSelect: (id: string | null) => void;
  onAddClick: () => void;
}

export function ChannelSidebar({ channels, selectedChannelId, onSelect, onAddClick }: ChannelSidebarProps) {
  return (
    <div className="flex h-[300px] xl:h-[calc(100vh-140px)] w-full xl:w-[240px] shrink-0 flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm xl:sticky xl:top-24">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-800">AI 渠道</h2>
        <Badge count={channels.length} />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {channels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center">
            <ShieldAlert className="size-8 stroke-[1.5] text-zinc-400" />
            <div className="space-y-1"><p className="text-[13px] font-medium text-zinc-800">暂无可用渠道</p><p className="text-[12px] text-zinc-500">点击下方按钮添加第一个渠道</p></div>
          </div>
        ) : (
          <div className="space-y-1">
            {channels.map((channel) => {
              const status = getStatus(channel);
              const isSelected = selectedChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  className={cn(
                    "group relative flex w-full items-center justify-between overflow-hidden rounded-xl px-3 py-3 transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    isSelected
                      ? "bg-zinc-800 text-white"
                      : "hover:bg-zinc-50 text-zinc-500"
                  )}
                >
                  <button
                    onClick={() => onSelect(channel.id)}
                    className="flex items-center gap-3 truncate text-left flex-1 min-w-0"
                  >
                    <StatusIndicator status={status} />
                    <span className={cn(
                      "truncate text-[13px] font-medium transition-colors duration-150",
                      isSelected ? "text-white" : "text-zinc-800 group-hover:text-zinc-800"
                    )}>
                      {channel.name}
                    </span>
                  </button>
                  {isSelected && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-white/40 rounded-r-full" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 p-3">
        <Button
          onClick={onAddClick}
          variant="default"
          className="w-full justify-start gap-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700"
        >
          <Plus className="size-4 stroke-[1.5]" />
          添加渠道
        </Button>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: "healthy" | "circuit" | "disabled" }) {
  if (status === "healthy") {
    return <div className="h-2 w-2 shrink-0 rounded-full bg-[#6FAA7D] ring-1 ring-white" title="健康" />;
  }
  if (status === "circuit") {
    return <div className="h-2 w-2 shrink-0 rounded-full bg-[#C9604D] ring-1 ring-white animate-pulse" title="熔断中" />;
  }
  return <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-200" title="已禁用" />;
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-medium tabular-nums text-zinc-700">
      {count}
    </span>
  );
}
