"use client";

import { cn } from "@/lib/utils";
import type { AiFeatureCardItem, FeatureSaveState } from "./types";
import type { AiFeatureGroupSection } from "./utils";

interface FeatureMasterListProps {
  groups: AiFeatureGroupSection[];
  selectedFeatureId: string | null;
  saveStates: Record<string, FeatureSaveState>;
  onSelect: (id: string) => void;
}

export function FeatureMasterList({
  groups,
  selectedFeatureId,
  saveStates,
  onSelect,
}: FeatureMasterListProps) {
  return (
    <nav
      aria-label="AI 功能列表"
      className="flex w-full flex-col gap-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 xl:w-[260px] xl:shrink-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-160px)] xl:overflow-y-auto"
    >
      {groups.map((group) => (
        <div key={group.group} className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              {group.group}
            </p>
            <span className="text-[11px] font-medium tabular-nums text-zinc-400">
              {group.features.length}
            </span>
          </div>

          <ul className="space-y-1">
            {group.features.map((feature) => (
              <FeatureMasterRow
                key={feature.id}
                feature={feature}
                isActive={selectedFeatureId === feature.id}
                saveState={saveStates[feature.id] ?? "idle"}
                onSelect={() => onSelect(feature.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface FeatureMasterRowProps {
  feature: AiFeatureCardItem;
  isActive: boolean;
  saveState: FeatureSaveState;
  onSelect: () => void;
}

function FeatureMasterRow({ feature, isActive, saveState, onSelect }: FeatureMasterRowProps) {
  const hasChannel = Boolean(feature.channel_id);
  const hasPrompt = Boolean(feature.system_prompt.trim());
  const isCustomized = hasChannel || hasPrompt;
  const isFullyCustom = hasChannel && hasPrompt;

  let statusColor = "bg-zinc-300";
  let statusLabel = "默认";
  if (isFullyCustom) {
    statusColor = "bg-[#6FAA7D]";
    statusLabel = "已自定义";
  } else if (isCustomized) {
    statusColor = "bg-[#D99E55]";
    statusLabel = "部分自定义";
  }

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isActive
            ? "bg-white text-zinc-800 ring-1 ring-inset ring-[#D97757]/30"
            : "text-zinc-600 hover:bg-white hover:text-zinc-800",
        )}
      >
        {isActive && (
          <span className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-r-full bg-[#D97757]" />
        )}

        <span className="min-w-0 flex-1 truncate pl-1 text-[13px] font-medium leading-[1.5]">
          {feature.metadata.title}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {saveState === "pending" && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" aria-label="待保存" />
          )}
          {saveState === "saving" && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" aria-label="保存中" />
          )}
          {saveState === "error" && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9604D]" aria-label="保存失败" />
          )}
          {(saveState === "idle" || saveState === "saved") && (
            <span
              className={cn("h-1.5 w-1.5 rounded-full", statusColor)}
              aria-label={statusLabel}
            />
          )}
        </span>
      </button>
    </li>
  );
}
