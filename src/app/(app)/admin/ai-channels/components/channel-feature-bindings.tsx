"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { motion } from "framer-motion";

import type { AiChannelRow, AiFeatureItem, FeatureSaveState } from "./types";
import { buildFeatureGroups } from "./utils";
import { FeatureMasterList } from "./feature-master-list";
import { FeatureDetailPanel } from "./feature-detail-panel";

const SELECTED_FEATURE_STORAGE_KEY = "dydata:admin:ai-channels:selected-feature-id";

interface ChannelFeatureBindingsProps {
  channelId: string | null;
  channels: AiChannelRow[];
  features: AiFeatureItem[];
  saveStates: Record<string, FeatureSaveState>;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
}

export function ChannelFeatureBindings({
  channelId,
  channels,
  features,
  saveStates,
  onFeaturePatch,
}: ChannelFeatureBindingsProps) {
  const featureGroups = useMemo(() => buildFeatureGroups(features), [features]);
  const flatFeatures = useMemo(() => featureGroups.flatMap((group) => group.features), [featureGroups]);

  const [selectedFeatureIdRaw, setSelectedFeatureIdRaw] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(SELECTED_FEATURE_STORAGE_KEY);
  });

  const selectedFeatureId = useMemo(() => {
    if (flatFeatures.length === 0) return null;
    if (selectedFeatureIdRaw && flatFeatures.some((feature) => feature.id === selectedFeatureIdRaw)) {
      return selectedFeatureIdRaw;
    }
    return flatFeatures[0].id;
  }, [flatFeatures, selectedFeatureIdRaw]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedFeatureId) {
      window.sessionStorage.setItem(SELECTED_FEATURE_STORAGE_KEY, selectedFeatureId);
    } else {
      window.sessionStorage.removeItem(SELECTED_FEATURE_STORAGE_KEY);
    }
  }, [selectedFeatureId]);

  if (!channelId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center"
      >
        <Info className="mb-3 size-7 stroke-[1.5] text-zinc-400" />
        <h3 className="text-[14px] font-medium text-zinc-800">先在左侧选择渠道，或新建一个渠道</h3>
        <p className="mt-1 text-[12px] text-zinc-500">渠道决定 AI 功能默认接管，配置项在选定后会出现在这里。</p>
      </motion.div>
    );
  }

  if (featureGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-12 text-center text-[13px] text-zinc-500">
        没有找到任何功能配置
      </div>
    );
  }

  const selectedFeature = flatFeatures.find((feature) => feature.id === selectedFeatureId) ?? null;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <FeatureMasterList
        groups={featureGroups}
        selectedFeatureId={selectedFeatureId}
        saveStates={saveStates}
        onSelect={setSelectedFeatureIdRaw}
      />

      <FeatureDetailPanel
        feature={selectedFeature}
        channels={channels}
        saveState={selectedFeature ? saveStates[selectedFeature.id] ?? "idle" : "idle"}
        onPatch={(patch) => {
          if (selectedFeature) onFeaturePatch(selectedFeature.id, patch);
        }}
      />
    </div>
  );
}
