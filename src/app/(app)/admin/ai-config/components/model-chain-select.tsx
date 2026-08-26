"use client";

import { useMemo } from "react";
import { type ModelDirectoryEntry } from "../model-directory";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** 模型选择下拉 + 该模型渠道顺位预览（模型为主，跨渠道自动切换） */
export function ModelChainSelect({
  modelDirectory,
  value,
  onChange,
  id,
  allowEmptyLabel,
}: {
  modelDirectory: ModelDirectoryEntry[];
  value: string | null;
  onChange: (modelId: string | null) => void;
  id?: string;
  allowEmptyLabel?: string;
}) {
  const selected = useMemo(
    () => modelDirectory.find((entry) => entry.modelId === value) ?? null,
    [modelDirectory, value],
  );

  return (
    <div className="space-y-1.5">
      <Select
        value={value ?? (allowEmptyLabel ? "__empty__" : "")}
        onValueChange={(val) => onChange(val === "__empty__" || !val ? null : val)}
      >
        <SelectTrigger
          id={id}
          aria-label={id}
          className="h-8 w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-2.5 text-[12px] font-mono text-[#1C1917] hover:bg-white focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#D97757]/30 transition-colors"
        >
          <SelectValue>
            {selected
              ? `${selected.label} (${selected.channels.length} 渠道可用)`
              : allowEmptyLabel || "请选择模型..."}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-56 font-mono text-[12px]">
          {allowEmptyLabel && <SelectItem value="__empty__">{allowEmptyLabel}</SelectItem>}
          {modelDirectory.map((entry) => (
            <SelectItem key={entry.modelId} value={entry.modelId}>
              {entry.label} ({entry.channels.length} 渠道可用)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <div className="rounded-lg border border-[#E5E0D6]/70 bg-white/90 p-2 text-[11px] leading-relaxed text-[#292524] space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-[#78716C]">
            <span className="font-medium text-[#1C1917] font-mono text-[11px]">
              {selected.label}
            </span>
            <span>顺位调度 ({selected.channels.length} 个渠道)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {selected.channels.map((channel, index) => (
              <div key={`${channel.name}-${index}`} className="flex items-center gap-1">
                {index > 0 && <span className="text-[#A8A29E] text-[10px]">→</span>}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
                    index === 0
                      ? "bg-[#6FAA7D]/10 text-[#1C1917] border border-[#6FAA7D]/20 font-medium"
                      : "bg-[#F5F3EE] text-[#78716C] border border-[#E5E0D6]/80",
                  )}
                >
                  {index === 0 && <span className="size-1 rounded-full bg-[#6FAA7D]" />}
                  {channel.name}
                  {index === 0 && <span className="text-[9px] opacity-80">(首选)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
