"use client";

import { useState, useMemo } from "react";
import { AiFeatureItem } from "./types";
import { ChannelFeatureCard } from "./channel-feature-card";
import { buildFeatureGroups } from "./utils";
import { ShieldAlert, Info } from "lucide-react";
import { motion } from "framer-motion";

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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 rounded-2xl border border-dashed border-border/50 bg-transparent p-8 md:p-16 text-center flex flex-col items-center justify-center"
      >
        <ShieldAlert className="size-8 text-muted-foreground/30 mb-3" />
        <h3 className="text-base font-medium text-[var(--color-text-primary)]">选择或创建一个渠道</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm">
          在左侧选择一个渠道后，可在此处配置该渠道承接的 AI 功能
        </p>
      </motion.div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">功能接管</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm">
            将特定的 AI 功能指派给当前渠道处理，修改会自动保存。
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 bg-muted/20">
          <Info className="size-3.5" />
          <span>关闭开关则功能回到&quot;自动分配&quot;状态</span>
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
              <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-2 pl-1">
                {group.group}
                <span className="text-[10px] font-normal text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full">
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
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
