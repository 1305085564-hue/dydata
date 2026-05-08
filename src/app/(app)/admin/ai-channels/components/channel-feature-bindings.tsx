"use client";

import { useState, useMemo } from "react";
import { AiChannelRow, AiFeatureItem } from "./types";
import { ChannelFeatureCard } from "./channel-feature-card";
import { buildFeatureGroups } from "./utils";
import { Info } from "lucide-react";
import { motion } from "framer-motion";

interface ChannelFeatureBindingsProps {
  channelId: string | null;
  channels: AiChannelRow[];
  features: AiFeatureItem[];
  saveStates: Record<string, "idle" | "pending" | "saving" | "saved" | "error">;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
}

export function ChannelFeatureBindings({
  channelId,
  channels,
  features,
  saveStates,
  onFeaturePatch
}: ChannelFeatureBindingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const featureGroups = useMemo(() => buildFeatureGroups(features), [features]);

  if (!channelId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 rounded-2xl bg-transparent p-8 md:p-16 text-center flex flex-col items-center justify-center"
      >
        <Info className="size-8 text-muted-foreground/30 mb-3" />
        <h3 className="text-base font-medium text-zinc-950">请在左侧选择渠道，或新建一个渠道</h3>
      </motion.div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">功能接管</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm">
            当前渠道仅作为对照视角。每个功能都可独立指定接管渠道和模型，留空则由系统自动接管。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 border-l-2 border-zinc-950 bg-zinc-50">
          <div className="flex items-center gap-1.5"><Info className="size-3.5" /> 提示：</div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <span>渠道留空 = 默认自动 (failover)</span>
            <span className="hidden sm:inline">|</span>
            <span>模型留空 = 跟随渠道默认模型</span>
          </div>
        </div>
      </div>

      {featureGroups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-12 text-center text-sm text-muted-foreground border border-dashed border-border/40 rounded-2xl"
        >
          没有找到任何功能配置
        </motion.div>
      ) : (
        <div className="space-y-10">
          {featureGroups.map((group, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={group.group}
              className="space-y-4"
            >
              <h3 className="text-sm font-medium text-zinc-950 flex items-center gap-2 pl-1">
                {group.group}
                <span className="text-[10px] font-normal text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                  {group.features.length}
                </span>
              </h3>

              <div className="flex flex-col gap-2">
                {group.features.map((feature) => (
                  <ChannelFeatureCard
                    key={feature.id}
                    feature={feature}
                    channels={channels}
                    currentChannelId={channelId}
                    isExpanded={expandedId === feature.id}
                    saveState={saveStates[feature.id] || "idle"}
                    onToggleExpand={() => toggleExpand(feature.id)}
                    onPatch={(patch) => onFeaturePatch(feature.id, patch)}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
