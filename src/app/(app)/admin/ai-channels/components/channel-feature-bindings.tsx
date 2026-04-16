"use client";

import { useState, useMemo } from "react";
import { AiFeatureCardItem, AiFeatureItem } from "./types";
import { ChannelFeatureCard } from "./channel-feature-card";
import { buildFeatureGroups } from "./utils";
import { ShieldAlert, Info } from "lucide-react";

interface ChannelFeatureBindingsProps {
  channelId: string | null;
  features: AiFeatureItem[];
  saveStates: Record<string, "idle" | "pending" | "saving" | "saved" | "error">;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
}

export function ChannelFeatureBindings({
  channelId,
  features,
  saveStates,
  onFeaturePatch
}: ChannelFeatureBindingsProps) {
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const featureGroups = useMemo(() => buildFeatureGroups(features), [features]);

  if (!channelId) {
    return (
      <div className="mt-6 rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px] p-12 text-center flex flex-col items-center justify-center">
        <ShieldAlert className="size-10 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text-primary)]">选择或创建一个渠道</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          在左侧选择一个渠道后，可在此处配置该渠道承接的 AI 功能
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6 rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">该渠道可承接的功能</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            打开开关，将功能指派给当前渠道处理。修改会自动保存。
          </p>
        </div>
        
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 border border-blue-100">
          <Info className="size-3.5" />
          <span>关闭开关则功能回到"自动分配"状态</span>
        </div>
      </div>

      {featureGroups.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">没有找到任何功能配置</div>
      ) : (
        <div className="space-y-8">
          {featureGroups.map((group) => (
            <div key={group.group} className="space-y-3">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                {group.group}
                <span className="text-xs font-normal text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {group.features.length}
                </span>
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {group.features.map((feature) => (
                  <ChannelFeatureCard
                    key={feature.id}
                    feature={feature}
                    currentChannelId={channelId}
                    isExpanded={!!expandedCards[feature.id]}
                    saveState={saveStates[feature.id] || "idle"}
                    onToggleExpand={() => toggleExpand(feature.id)}
                    onPatch={(patch) => onFeaturePatch(feature.id, patch)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
