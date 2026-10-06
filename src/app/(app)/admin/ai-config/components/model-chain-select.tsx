"use client";

import { useMemo } from "react";
import { type ModelDirectoryEntry } from "../model-directory";
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
              ? `${selected.label} (${selected.channels.length} 个密钥就绪)`
              : allowEmptyLabel || "请选择模型..."}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64 min-w-[280px] max-w-[360px] w-auto rounded-xl border border-[#E2E2DF] bg-white p-1 text-[#1F1E1D] shadow-claude-float font-mono text-[12px]">
          {allowEmptyLabel && <SelectItem value="__empty__" className="py-1.5">{allowEmptyLabel}</SelectItem>}
          {modelDirectory.map((entry) => (
            <SelectItem key={entry.modelId} value={entry.modelId} className="py-1.5">
              <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
                <span className="truncate">{entry.label}</span>
                <span className="text-[#78716C] shrink-0 whitespace-nowrap text-[11px]">
                  ({entry.channels.length} 个密钥就绪)
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && selected.channels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[12px] text-[#78716C]">
          <span className="text-[#A8A29E]">顺位：</span>
          {selected.channels.map((channel, index) => (
            <span key={`${channel.name}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 && <span className="text-[#D1D0CB]">→</span>}
              <span
                className={
                  index === 0
                    ? "font-mono font-medium text-[#141413] bg-[#F1F1F0] px-1.5 py-0.5 rounded"
                    : "font-mono text-[#78716C] bg-[#FAF9F6] px-1.5 py-0.5 rounded"
                }
              >
                {channel.name}
                {index === 0 && <span className="text-[#78716C] ml-1 font-normal text-[11px]">(首选)</span>}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
