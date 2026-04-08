"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, ChevronDown, ChevronUp, Loader2, Save, Settings2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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

type NavCardItem = {
  title: string;
  description: string;
  href: string | null;
  label: string;
  icon?: typeof Settings2;
};

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const AUTO_CHANNEL_VALUE = "__auto__";
const DEFAULT_MODEL_VALUE = "__default__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEBOUNCE_MS = 500;

const MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-3.1-pro-high",
  "gemini-3-flash",
];

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

function isCustomModel(model: string) {
  return Boolean(model.trim() && !MODEL_OPTIONS.includes(model.trim()));
}

function getModelSelectValue(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_MODEL_VALUE;
  if (MODEL_OPTIONS.includes(trimmed)) return trimmed;
  return CUSTOM_MODEL_VALUE;
}

function formatSaveMeta(status: SaveStatus) {
  if (status === "error") {
    return {
      label: "保存失败",
      variant: "destructive" as const,
      className: "",
    };
  }

  if (status === "saved") {
    return {
      label: "已保存",
      variant: "secondary" as const,
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "saving") {
    return {
      label: "保存中",
      variant: "outline" as const,
      className: "",
    };
  }

  if (status === "pending") {
    return {
      label: "待保存",
      variant: "outline" as const,
      className: "",
    };
  }

  return null;
}

function formatDateTime(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AIFeaturesClient() {
  const [features, setFeatures] = useState<AiFeatureItem[]>([]);
  const [channels, setChannels] = useState<AiChannelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveStatus>>({});
  const [promptOpen, setPromptOpen] = useState<Record<string, boolean>>({});
  const [customModelMode, setCustomModelMode] = useState<Record<string, boolean>>({});

  const featuresRef = useRef<AiFeatureItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const lastSavedRef = useRef<Record<string, string>>({});
  const requestSeqRef = useRef<Record<string, number>>({});

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of Object.values(timers)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, []);

  async function loadData(nextSilent = false) {
    if (nextSilent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [featuresRes, channelsRes] = await Promise.all([
        fetch("/api/admin/ai-features", { cache: "no-store" }),
        fetch("/api/admin/ai-channels", { cache: "no-store" }),
      ]);
      const [featuresData, channelsData] = await Promise.all([featuresRes.json(), channelsRes.json()]);

      if (!featuresRes.ok || featuresData.error) {
        throw new Error(featuresData.error || "加载功能配置失败");
      }
      if (!channelsRes.ok || channelsData.error) {
        throw new Error(channelsData.error || "加载渠道列表失败");
      }

      const nextFeatures = Array.isArray(featuresData.features)
        ? (featuresData.features as AiFeatureApiRow[]).map(normalizeFeature)
        : [];
      const nextChannels = Array.isArray(channelsData.channels)
        ? (channelsData.channels as Array<{ id: string; name: string }>).map((item) => ({
            id: item.id,
            name: item.name,
          }))
        : [];

      setFeatures(nextFeatures);
      setChannels(nextChannels);
      setPromptOpen((prev) => {
        const next = { ...prev };
        for (const feature of nextFeatures) {
          if (!(feature.id in next)) {
            next[feature.id] = Boolean(feature.system_prompt.trim());
          }
        }
        return next;
      });
      setCustomModelMode((prev) => {
        const next = { ...prev };
        for (const feature of nextFeatures) {
          next[feature.id] = prev[feature.id] ?? isCustomModel(feature.model);
        }
        return next;
      });

      const nextSaved: Record<string, string> = {};
      for (const feature of nextFeatures) {
        nextSaved[feature.id] = JSON.stringify(toRequestPayload(feature));
      }
      lastSavedRef.current = nextSaved;
      featuresRef.current = nextFeatures;
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载功能配置失败";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function setFeaturePatch(id: string, patch: Partial<AiFeatureItem>) {
    setFeatures((prev) => {
      let nextFeature: AiFeatureItem | null = null;
      const next = prev.map((feature) => {
        if (feature.id !== id) return feature;
        nextFeature = { ...feature, ...patch };
        return nextFeature;
      });

      if (nextFeature) {
        setSaveStates((current) => ({ ...current, [id]: "pending" }));
        queueSave(id);
      }

      return next;
    });
  }

  function queueSave(id: string) {
    const timer = timersRef.current[id];
    if (timer) clearTimeout(timer);

    timersRef.current[id] = setTimeout(() => {
      void saveFeature(id);
    }, DEBOUNCE_MS);
  }

  async function saveFeature(id: string) {
    const current = featuresRef.current.find((item) => item.id === id);
    if (!current) return;

    const payload = toRequestPayload(current);
    const payloadKey = JSON.stringify(payload);
    if (lastSavedRef.current[id] === payloadKey) {
      setSaveStates((prev) => ({ ...prev, [id]: "idle" }));
      return;
    }

    const requestSeq = (requestSeqRef.current[id] ?? 0) + 1;
    requestSeqRef.current[id] = requestSeq;
    setSaveStates((prev) => ({ ...prev, [id]: "saving" }));

    try {
      const res = await fetch("/api/admin/ai-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "保存失败");
      }

      if (requestSeqRef.current[id] !== requestSeq) {
        return;
      }

      const saved = normalizeFeature(data.feature as AiFeatureApiRow);
      lastSavedRef.current[id] = JSON.stringify(toRequestPayload(saved));

      setFeatures((prev) => prev.map((feature) => (feature.id === id ? saved : feature)));
      setSaveStates((prev) => ({ ...prev, [id]: "saved" }));
      setCustomModelMode((prev) => ({ ...prev, [id]: prev[id] && isCustomModel(saved.model) }));
      toast.success(`${saved.label} 已保存`);
    } catch (err) {
      if (requestSeqRef.current[id] !== requestSeq) {
        return;
      }

      const message = err instanceof Error ? err.message : "保存失败";
      setSaveStates((prev) => ({ ...prev, [id]: "error" }));
      toast.error(`${current.label} 保存失败：${message}`);
    }
  }

  const navCards: NavCardItem[] = [
    {
      title: "管理入口",
      description: "从这里回到总控台。",
      href: "/admin",
      label: "返回总控台",
    },
    {
      title: "AI 渠道管理",
      description: "管理各家模型渠道与 failover 顺序。",
      href: "/admin/ai-channels",
      label: "去看渠道",
    },
    {
      title: "AI 功能配置",
      description: "按功能指定渠道、模型和提示词。",
      href: null,
      label: "当前页面",
      icon: Settings2,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Feature Routing</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">AI 功能配置</h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                为每个 AI 功能指定渠道、模型和提示词。留空时走默认 failover 和系统提示词。
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
            <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
              <Sparkles className="size-3.5 text-[var(--color-primary)]" />
              功能导航
            </div>
            <div className="space-y-2 pt-1">
              {navCards.map((item) =>
                item.href ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]"
                  >
                    <div className="flex items-start gap-3">
                      {"icon" in item && item.icon ? (
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                          <item.icon className="size-4" />
                        </div>
                      ) : null}
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
                  </Link>
                ) : (
                  <div key={item.title} className="rounded-2xl border border-primary/15 bg-primary/10 px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
                    <div className="flex items-start gap-3">
                      {"icon" in item && item.icon ? (
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-white/70 text-primary">
                          <item.icon className="size-4" />
                        </div>
                      ) : null}
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-semibold tracking-tight">功能列表</CardTitle>
              <CardDescription className="mt-1">每次修改会自动保存。禁用后，对应 AI 功能会直接停止调用。</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadData(true)} disabled={isRefreshing || isLoading}>
              {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              刷新配置
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-8 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="size-4 animate-spin" />
              正在加载功能配置...
            </div>
          ) : features.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-white/70 px-4 py-12 text-center">
              <TriangleAlert className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">还没有功能配置</p>
                <p className="text-xs text-[var(--color-text-secondary)]">请先在数据库初始化 ai_feature_config。</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {features.map((feature) => {
                const saveMeta = formatSaveMeta(saveStates[feature.id] ?? "idle");
                const showCustomInput = customModelMode[feature.id] || isCustomModel(feature.model);

                return (
                  <Card key={feature.id} size="sm" className="border-white/70 bg-white/86">
                    <CardHeader className="border-b border-white/70 pb-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Bot className="size-4 text-[var(--color-primary)]" />
                            <CardTitle className="font-semibold text-[var(--color-text-primary)]">{feature.label}</CardTitle>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[var(--color-text-secondary)]">{feature.feature_key}</span>
                            <Badge variant={feature.is_enabled ? "default" : "outline"} className={feature.is_enabled ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>
                              {feature.is_enabled ? "已启用" : "已禁用"}
                            </Badge>
                            {saveMeta ? (
                              <Badge variant={saveMeta.variant} className={saveMeta.className}>
                                {saveMeta.label}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
                          <span className="text-xs text-[var(--color-text-secondary)]">启用</span>
                          <Switch
                            checked={feature.is_enabled}
                            onCheckedChange={(checked) => setFeaturePatch(feature.id, { is_enabled: checked })}
                            aria-label={`${feature.label} 启用开关`}
                          />
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`feature-channel-${feature.id}`}>渠道选择</Label>
                          <Select
                            value={feature.channel_id || AUTO_CHANNEL_VALUE}
                            onValueChange={(value) =>
                              setFeaturePatch(feature.id, {
                                channel_id: value === AUTO_CHANNEL_VALUE ? "" : (value ?? ""),
                              })
                            }
                          >
                            <SelectTrigger id={`feature-channel-${feature.id}`} className="h-10 w-full rounded-2xl bg-white/80">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={AUTO_CHANNEL_VALUE}>默认自动（failover）</SelectItem>
                              {channels.map((channel) => (
                                <SelectItem key={channel.id} value={channel.id}>
                                  {channel.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`feature-model-${feature.id}`}>模型选择</Label>
                          <Select
                            value={getModelSelectValue(feature.model)}
                            onValueChange={(value) => {
                              if (value === DEFAULT_MODEL_VALUE) {
                                setCustomModelMode((prev) => ({ ...prev, [feature.id]: false }));
                                setFeaturePatch(feature.id, { model: "" });
                                return;
                              }

                              if (value === CUSTOM_MODEL_VALUE) {
                                setCustomModelMode((prev) => ({ ...prev, [feature.id]: true }));
                                return;
                              }

                              setCustomModelMode((prev) => ({ ...prev, [feature.id]: false }));
                              setFeaturePatch(feature.id, { model: value ?? "" });
                            }}
                          >
                            <SelectTrigger id={`feature-model-${feature.id}`} className="h-10 w-full rounded-2xl bg-white/80">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={DEFAULT_MODEL_VALUE}>跟随渠道默认</SelectItem>
                              {MODEL_OPTIONS.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                              <SelectItem value={CUSTOM_MODEL_VALUE}>自定义输入</SelectItem>
                            </SelectContent>
                          </Select>

                          {showCustomInput ? (
                            <Input
                              value={isCustomModel(feature.model) ? feature.model : ""}
                              onChange={(e) => setFeaturePatch(feature.id, { model: e.target.value })}
                              placeholder="输入自定义模型名"
                              className="h-10 rounded-2xl bg-white/80"
                            />
                          ) : null}
                        </div>
                      </div>

                      <Collapsible
                        open={promptOpen[feature.id] ?? false}
                        onOpenChange={(open) => setPromptOpen((prev) => ({ ...prev, [feature.id]: open }))}
                        className="rounded-2xl border border-white/70 bg-white/70"
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--color-text-primary)] transition hover:bg-muted/40">
                          <span>自定义提示词</span>
                          {promptOpen[feature.id] ? (
                            <ChevronUp className="size-4 text-[var(--color-text-tertiary)]" />
                          ) : (
                            <ChevronDown className="size-4 text-[var(--color-text-tertiary)]" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4">
                          <Textarea
                            value={feature.system_prompt}
                            onChange={(e) => setFeaturePatch(feature.id, { system_prompt: e.target.value })}
                            placeholder="留空则使用系统默认提示词"
                            className="min-h-[120px] rounded-2xl bg-white/90"
                          />
                        </CollapsibleContent>
                      </Collapsible>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
                        <span>当前渠道：{feature.channel_name ?? "默认自动（failover）"}</span>
                        <span>更新时间：{formatDateTime(feature.updated_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
