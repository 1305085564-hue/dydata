"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AI_FEATURE_GROUP_ORDER, getAiFeatureMetadata, type AiFeatureGroup, type AiFeatureMetadata } from "@/lib/ai/feature-metadata";
import { AIFeaturesHero } from "./ai-features-hero";
import { AIFeaturesNavCards } from "./ai-features-nav-cards";
import { AIFeaturesGroupList } from "./ai-features-group-list";

type AiFeatureApiRow = {
  id: string;
  feature_key: string;
  label: string;
  channel_id: string | null;
  channel_name: string | null;
  model: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type AiFeatureItem = {
  id: string;
  feature_key: string;
  label: string;
  channel_id: string;
  channel_name: string | null;
  model: string;
  system_prompt: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type AiChannelOption = {
  id: string;
  name: string;
};

export type AiFeatureCardItem = AiFeatureItem & {
  metadata: AiFeatureMetadata;
};

export type AiFeatureGroupSection = {
  group: AiFeatureGroup;
  description: string;
  features: AiFeatureCardItem[];
};

const DEBOUNCE_MS = 500;

const GROUP_DESCRIPTIONS: Record<AiFeatureGroup, string> = {
  成长分析: "把 growth 页里的区块说明、AI 输出职责和专属提示词收成一套。",
  内容工具: "服务内容策划和批量生产，不跟 growth 诊断混在一起。",
  "OCR/截图识别": "负责把截图先识别成结构化数据，给后面的分析接口当输入。",
  "后台 AI 助手": "服务管理员操作和诊断，不直接给前台用户看。",
  "其他已有 AI 能力": "保留现有 AI 能力，先按用途归档，后续再细分。",
};

function normalizeFeature(row: AiFeatureApiRow): AiFeatureItem {
  return {
    id: row.id,
    feature_key: row.feature_key,
    label: row.label,
    channel_id: row.channel_id ?? "",
    channel_name: row.channel_name,
    model: row.model ?? "",
    system_prompt: row.system_prompt ?? "",
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toRequestPayload(feature: AiFeatureItem) {
  return {
    id: feature.id,
    channel_id: feature.channel_id.trim() ? feature.channel_id : null,
    model: feature.model.trim() ? feature.model.trim() : null,
    system_prompt: feature.system_prompt.trim() ? feature.system_prompt : null,
    is_enabled: feature.is_enabled,
  };
}

export function buildFeatureGroups(features: AiFeatureItem[]): AiFeatureGroupSection[] {
  const bucket = new Map<AiFeatureGroup, AiFeatureCardItem[]>();
  for (const feature of features) {
    const metadata = getAiFeatureMetadata(feature.feature_key, feature.label);
    const list = bucket.get(metadata.group) ?? [];
    list.push({ ...feature, metadata });
    bucket.set(metadata.group, list);
  }
  return AI_FEATURE_GROUP_ORDER
    .map((group) => ({
      group,
      description: GROUP_DESCRIPTIONS[group],
      features: (bucket.get(group) ?? []).sort((left, right) => left.metadata.title.localeCompare(right.metadata.title, "zh-CN")),
    }))
    .filter((section) => section.features.length > 0);
}

export default function AIFeaturesClient() {
  const [features, setFeatures] = useState<AiFeatureItem[]>([]);
  const [channels, setChannels] = useState<AiChannelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, "idle" | "pending" | "saving" | "saved" | "error">>({});
  const [promptOpen, setPromptOpen] = useState<Record<string, boolean>>({});
  const [customModelMode, setCustomModelMode] = useState<Record<string, boolean>>({});

  const featuresRef = useRef<AiFeatureItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const lastSavedRef = useRef<Record<string, string>>({});
  const requestSeqRef = useRef<Record<string, number>>({});

  useEffect(() => { featuresRef.current = features; }, [features]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { for (const t of Object.values(timers)) { if (t) clearTimeout(t); } };
  }, []);

  async function loadData(silent = false) {
    if (silent) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const [fRes, cRes] = await Promise.all([
        fetch("/api/admin/ai-features", { cache: "no-store" }),
        fetch("/api/admin/ai-channels", { cache: "no-store" }),
      ]);
      const [fData, cData] = await Promise.all([fRes.json(), cRes.json()]);
      if (!fRes.ok || fData.error) throw new Error(fData.error || "加载功能配置失败");
      if (!cRes.ok || cData.error) throw new Error(cData.error || "加载渠道列表失败");

      const nextFeatures = Array.isArray(fData.features)
        ? (fData.features as AiFeatureApiRow[]).map(normalizeFeature) : [];
      const nextChannels = Array.isArray(cData.channels)
        ? (cData.channels as Array<{ id: string; name: string }>).map((c) => ({ id: c.id, name: c.name })) : [];

      setFeatures(nextFeatures);
      setChannels(nextChannels);
      setPromptOpen((prev) => {
        const next = { ...prev };
        for (const f of nextFeatures) { if (!(f.id in next)) next[f.id] = Boolean(f.system_prompt.trim()); }
        return next;
      });
      setCustomModelMode((prev) => {
        const next = { ...prev };
        for (const f of nextFeatures) {
          next[f.id] = prev[f.id] ?? Boolean(f.model.trim() && !["gpt-5.4","gpt-5.4-mini","gpt-5.4-nano","claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5-20251001","gemini-3.1-pro-high","gemini-3-flash"].includes(f.model.trim()));
        }
        return next;
      });
      const nextSaved: Record<string, string> = {};
      for (const f of nextFeatures) nextSaved[f.id] = JSON.stringify(toRequestPayload(f));
      lastSavedRef.current = nextSaved;
      featuresRef.current = nextFeatures;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载功能配置失败";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  function setFeaturePatch(id: string, patch: Partial<AiFeatureItem>) {
    setFeatures((prev) => {
      let nextFeature: AiFeatureItem | null = null;
      const next = prev.map((f) => {
        if (f.id !== id) return f;
        nextFeature = { ...f, ...patch };
        return nextFeature;
      });
      if (nextFeature) {
        setSaveStates((cur) => ({ ...cur, [id]: "pending" }));
        queueSave(id);
      }
      return next;
    });
  }

  function queueSave(id: string) {
    const timer = timersRef.current[id];
    if (timer) clearTimeout(timer);
    timersRef.current[id] = setTimeout(() => { void saveFeature(id); }, DEBOUNCE_MS);
  }

  async function saveFeature(id: string) {
    const current = featuresRef.current.find((f) => f.id === id);
    if (!current) return;
    const payload = toRequestPayload(current);
    const payloadKey = JSON.stringify(payload);
    if (lastSavedRef.current[id] === payloadKey) {
      setSaveStates((p) => ({ ...p, [id]: "idle" }));
      return;
    }
    const seq = (requestSeqRef.current[id] ?? 0) + 1;
    requestSeqRef.current[id] = seq;
    setSaveStates((p) => ({ ...p, [id]: "saving" }));
    try {
      const res = await fetch("/api/admin/ai-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "保存失败");
      if (requestSeqRef.current[id] !== seq) return;
      const saved = normalizeFeature(data.feature as AiFeatureApiRow);
      lastSavedRef.current[id] = JSON.stringify(toRequestPayload(saved));
      setFeatures((p) => p.map((f) => (f.id === id ? saved : f)));
      setSaveStates((p) => ({ ...p, [id]: "saved" }));
      setCustomModelMode((p) => ({ ...p, [id]: p[id] && Boolean(saved.model.trim() && !["gpt-5.4","gpt-5.4-mini","gpt-5.4-nano","claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5-20251001","gemini-3.1-pro-high","gemini-3-flash"].includes(saved.model.trim())) }));
      toast.success(`${saved.label} 已保存`);
    } catch (err) {
      if (requestSeqRef.current[id] !== seq) return;
      const msg = err instanceof Error ? err.message : "保存失败";
      setSaveStates((p) => ({ ...p, [id]: "error" }));
      toast.error(`${current.label} 保存失败：${msg}`);
    }
  }

  function handleFeaturePatch(id: string, patch: Record<string, unknown>) {
    if ("_setCustomModel" in patch) {
      setCustomModelMode((p) => ({ ...p, [id]: true }));
      return;
    }
    if ("_clearCustomModel" in patch) {
      const rest = { ...patch };
      delete rest._clearCustomModel;
      setCustomModelMode((p) => ({ ...p, [id]: false }));
      setFeaturePatch(id, rest as Partial<AiFeatureItem>);
      return;
    }
    setFeaturePatch(id, patch as Partial<AiFeatureItem>);
  }

  function handlePromptToggle(id: string, open: boolean) {
    setPromptOpen((p) => ({ ...p, [id]: open }));
  }

  const featureGroups = buildFeatureGroups(features);

  return (
    <div className="w-full space-y-8 px-4 py-4 sm:px-6 lg:px-8">
      <AIFeaturesHero />
      <AIFeaturesNavCards featureGroups={featureGroups} />
      <AIFeaturesGroupList
        featureGroups={featureGroups}
        channels={channels}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        featuresEmpty={features.length === 0}
        error={error}
        saveStates={saveStates}
        promptOpen={promptOpen}
        customModelMode={customModelMode}
        onRefresh={() => void loadData(true)}
        onFeaturePatch={handleFeaturePatch}
        onPromptToggle={handlePromptToggle}
      />
    </div>
  );
}
