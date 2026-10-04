"use client";

import { useMemo } from "react";
import { type ModelDirectoryEntry } from "../model-directory";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-1">
      <Select
        value={value ?? (allowEmptyLabel ? "__empty__" : "")}
        onValueChange={(val) => onChange(val === "__empty__" || !val ? null : val)}
      >
        <SelectTrigger
          id={id}
          aria-label={id}
          className="h-8 w-full rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 px-2.5 text-[12px] font-mono text-[#141413] hover:bg-white focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#141413]/10 transition-colors"
        >
          <SelectValue>
            {selected
              ? `${selected.label} (${selected.channels.length} 个密钥可用)`
              : allowEmptyLabel || "请选择模型..."}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] shadow-claude-float min-w-56 font-mono text-[12px]">
          {allowEmptyLabel && <SelectItem value="__empty__">{allowEmptyLabel}</SelectItem>}
          {modelDirectory.map((entry) => (
            <SelectItem key={entry.modelId} value={entry.modelId}>
              {entry.label} ({entry.channels.length} 个密钥可用)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <div className="rounded-xl border border-[#E2E2DF]/60 bg-white/90 p-2 text-[12px] leading-relaxed text-[#1F1E1D] space-y-1 shadow-claude-float">
          <div className="flex items-center justify-between text-[#78716C]">
            <span className="font-normal text-[#141413] font-mono text-[12px]">
              {selected.label}
            </span>
            <span>顺位调度 ({selected.channels.length} 个密钥)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {selected.channels.map((channel, index) => (
              <div key={`${channel.name}-${index}`} className="flex items-center gap-1">
                {index > 0 && <span className="text-[#A8A29E] text-[12px]">→</span>}
                <Badge
                  variant={index === 0 ? "success" : "secondary"}
                  className="font-mono text-[12px]"
                >
                  {channel.name}
                  {index === 0 && <span className="text-[12px] opacity-80">(首选)</span>}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
