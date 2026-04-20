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
    <div className="flex h-[300px] xl:h-[calc(100vh-140px)] w-full xl:w-[240px] shrink-0 flex-col rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px] xl:sticky xl:top-24">
      <div className="flex items-center justify-between border-b border-border/40 p-4">
        <h2 className="font-semibold tracking-tight text-[var(--color-text-primary)]">AI 渠道</h2>
        <Badge count={channels.length} />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {channels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-center">
            <ShieldAlert className="size-8 text-muted-foreground/60" />
            <div className="space-y-1"><p className="text-sm font-medium text-[var(--color-text-primary)]">暂无可用渠道</p><p className="text-xs text-[var(--color-text-secondary)]">点击下方按钮添加第一个渠道</p></div>
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
                    "group relative flex w-full items-center justify-between overflow-hidden rounded-xl px-3 py-3 transition-all duration-300 ease-out",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(var(--color-primary-rgb),0.2)]"
                      : "hover:bg-muted/80 text-[var(--color-text-secondary)] hover:-translate-y-0.5 hover:shadow-sm"
                  )}
                >
                  <button
                    onClick={() => onSelect(channel.id)}
                    className="flex items-center gap-3 truncate text-left flex-1 min-w-0"
                  >
                    <StatusIndicator status={status} />
                    <span className={cn(
                      "truncate text-sm font-medium transition-colors duration-200",
                      isSelected ? "text-primary-foreground font-semibold tracking-wide" : "text-[var(--color-text-primary)] group-hover:text-primary"
                    )}>
                      {channel.name}
                    </span>
                  </button>
                  {isSelected && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-white/30 rounded-r-full" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/40 p-3">
        <Button
          onClick={onAddClick}
          variant="default"
          className="w-full justify-start gap-2 rounded-xl bg-[var(--color-text-primary)] text-white hover:bg-[var(--color-text-primary)]/90"
        >
          <Plus className="size-4" />
          添加渠道
        </Button>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: "healthy" | "circuit" | "disabled" }) {
  if (status === "healthy") {
    return <div className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="健康" />;
  }
  if (status === "circuit") {
    return <div className="size-2 shrink-0 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" title="熔断中" />;
  }
  return <div className="size-2 shrink-0 rounded-full bg-muted-foreground/40" title="已禁用" />;
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {count}
    </span>
  );
}
