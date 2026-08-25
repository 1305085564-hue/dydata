"use client";

import { useMemo } from "react";
import { type ModelDirectoryEntry } from "../model-directory";

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
      <select
        id={id}
        aria-label={id}
        className="h-9 w-full rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {allowEmptyLabel && <option value="">{allowEmptyLabel}</option>}
        {modelDirectory.map((entry) => (
          <option key={entry.modelId} value={entry.modelId}>
            {entry.label}（{entry.channels.length} 个渠道可用）
          </option>
        ))}
      </select>
      {selected && (
        <div className="rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/70 px-3 py-2 text-[12px] leading-5 text-[#292524]">
          <span className="font-medium">{selected.label} 当前顺位：</span>
          <ol className="mt-1 space-y-0.5 list-decimal list-inside text-[#78716C]">
            {selected.channels.map((channel, index) => (
              <li key={`${channel.name}-${index}`}>
                {channel.name}
                {index === 0 && <span className="ml-1.5 text-[10px] font-medium text-[#16A34A]">首选</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
