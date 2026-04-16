"use client";

import { CheckCircle2, Loader2, Plus, ShieldAlert, XCircle } from "lucide-react";
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
    <div className="flex h-[calc(100vh-140px)] w-[240px] shrink-0 flex-col rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px] xl:sticky xl:top-24">
      <div className="flex items-center justify-between border-b border-border/40 p-4">
        <h2 className="font-semibold tracking-tight text-[var(--color-text-primary)]">AI 渠道</h2>
        <Badge count={channels.length} />
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        {channels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-center">
            <ShieldAlert className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-muted-foreground">暂无渠道</p>
          </div>
        ) : (
          <div className="space-y-1">
            {channels.map((channel) => {
              const status = getStatus(channel);
              const isSelected = selectedChannelId === channel.id;
              
              return (
                <button
                  key={channel.id}
                  onClick={() => onSelect(channel.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-all duration-200",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted/60 text-[var(--color-text-secondary)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <StatusIndicator status={status} />
                    <span className={cn("truncate text-sm font-medium", isSelected ? "text-primary-foreground" : "text-[var(--color-text-primary)]")}>
                      {channel.name}
                    </span>
                  </div>
                </button>
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
    return <div className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
  }
  if (status === "circuit") {
    return <div className="size-2 shrink-0 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />;
  }
  return <div className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />;
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {count}
    </span>
  );
}
