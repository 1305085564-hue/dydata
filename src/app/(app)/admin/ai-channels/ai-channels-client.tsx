"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AI_CHANNELS_CHANGED } from "@/components/admin-layout/admin-sidebar";

import { ChannelDetailForm } from "./components/channel-detail-form";
import { ChannelFeatureBindings } from "./components/channel-feature-bindings";
import { AiChannelRow, AiFeatureApiRow, AiFeatureItem, ChannelFormState, FeatureSaveState } from "./components/types";
import {
  FEATURE_SAVE_FEEDBACK_MS,
  applyFeaturePatch,
  buildFeatureSavePayload,
  getFeaturePayloadKey,
  isFeatureVersionCurrent,
  mergeLoadedFeatures,
  normalizeFeatureItem,
  resolveSelectedChannelId,
  sortChannels,
} from "./components/utils";

const DEBOUNCE_MS = 500;

function notifyChannelsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AI_CHANNELS_CHANGED));
}

function getChannelStatusColor(channel: AiChannelRow): string {
  if (!channel.is_enabled) return "bg-zinc-200";
  if (channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now()) {
    return "bg-[#C9604D]";
  }
  return "bg-[#6FAA7D]";
}

export default function AIChannelsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChannelParam = searchParams.get("channel");

  // State
  const [channels, setChannels] = useState<AiChannelRow[]>([]);
  const [features, setFeatures] = useState<AiFeatureItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    urlChannelParam && urlChannelParam !== "__new__" ? urlChannelParam : null,
  );
  const [isCreatingChannel, setIsCreatingChannel] = useState(urlChannelParam === "__new__");

  // Loading & Action State
  const [isLoading, setIsLoading] = useState(true);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const [featureSaveStates, setFeatureSaveStates] = useState<Record<string, FeatureSaveState>>({});
  const [deleteTarget, setDeleteTarget] = useState<AiChannelRow | null>(null);

  // Refs for debouncing auto-save
  const channelsRef = useRef<AiChannelRow[]>([]);
  const featuresRef = useRef<AiFeatureItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const saveFeedbackTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const loadSeqRef = useRef(0);
  const didInitRef = useRef(false);
  const featureVersionRef = useRef<Record<string, number>>({});
  const featureSaveStatesRef = useRef<Record<string, FeatureSaveState>>({});
  const lastSavedRef = useRef<Record<string, string>>({});
  const selectedChannelIdRef = useRef<string | null>(null);
  const isCreatingChannelRef = useRef(false);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);
  useEffect(() => { featuresRef.current = features; }, [features]);
  useEffect(() => {
    featureSaveStatesRef.current = featureSaveStates;
  }, [featureSaveStates]);
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);
  useEffect(() => {
    isCreatingChannelRef.current = isCreatingChannel;
  }, [isCreatingChannel]);

  const updateSelection = useCallback(
    (nextChannelId: string | null, nextIsCreatingChannel = false) => {
      selectedChannelIdRef.current = nextChannelId;
      isCreatingChannelRef.current = nextIsCreatingChannel;
      setSelectedChannelId(nextChannelId);
      setIsCreatingChannel(nextIsCreatingChannel);

      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (nextIsCreatingChannel) {
        params.set("channel", "__new__");
      } else if (nextChannelId) {
        params.set("channel", nextChannelId);
      } else {
        params.delete("channel");
      }
      const qs = params.toString();
      router.replace(`/admin/ai-channels${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router],
  );

  const clearFeatureSaveTimer = (id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      timersRef.current[id] = undefined;
    }
  };

  const clearFeatureFeedbackTimer = (id: string) => {
    const timer = saveFeedbackTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      saveFeedbackTimersRef.current[id] = undefined;
    }
  };

  // Initial Load
  const loadData = useCallback(async (silent = false) => {
    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    if (!silent) setIsLoading(true);

    try {
      const [cRes, fRes] = await Promise.all([
        fetch("/api/admin/ai-channels", { cache: "no-store" }),
        fetch("/api/admin/ai-features", { cache: "no-store" }),
      ]);

      const cData = await cRes.json();
      const fData = await fRes.json();

      if (!cRes.ok || cData.error) throw new Error(cData.error || "加载渠道失败");
      if (!fRes.ok || fData.error) throw new Error(fData.error || "加载功能失败");

      if (loadSeqRef.current !== loadSeq) {
        return;
      }

      const loadedChannels = sortChannels(Array.isArray(cData.channels) ? cData.channels : []);
      const loadedFeatures = Array.isArray(fData.features)
        ? fData.features.map((feature: AiFeatureApiRow) => normalizeFeatureItem(feature))
        : [];

      setChannels(loadedChannels);

      const mergedFeatures = mergeLoadedFeatures({
        loadedFeatures,
        localFeatures: featuresRef.current,
        saveStates: featureSaveStatesRef.current,
        lastSaved: lastSavedRef.current,
        validChannelIds: new Set(loadedChannels.map((channel) => channel.id)),
      });
      lastSavedRef.current = mergedFeatures.lastSaved;
      setFeatures(mergedFeatures.features);

      updateSelection(
        resolveSelectedChannelId({
          channels: loadedChannels,
          currentSelectedChannelId: selectedChannelIdRef.current,
          isCreatingChannel: isCreatingChannelRef.current,
        }),
        isCreatingChannelRef.current,
      );
    } catch (err) {
      if (loadSeqRef.current !== loadSeq) {
        return;
      }
      feedbackToast.error(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      if (loadSeqRef.current === loadSeq) {
        setIsLoading(false);
      }
    }
  }, [updateSelection]);

  useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;

    void loadData();
  }, [loadData]);

  // Sync URL → state when sidebar/back-button changes ?channel
  useEffect(() => {
    if (!didInitRef.current) return;
    const desiredCreating = urlChannelParam === "__new__";
    const desiredId = !desiredCreating && urlChannelParam ? urlChannelParam : null;
    if (
      desiredCreating === isCreatingChannelRef.current &&
      desiredId === selectedChannelIdRef.current
    ) {
      return;
    }
    selectedChannelIdRef.current = desiredId;
    isCreatingChannelRef.current = desiredCreating;
    setSelectedChannelId(desiredId);
    setIsCreatingChannel(desiredCreating);
  }, [urlChannelParam]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    Object.values(saveFeedbackTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  // Set action busy state
  const setBusy = (key: string, isBusy: boolean) => {
    setBusyActions((prev) => ({ ...prev, [key]: isBusy }));
  };

  // Channel Actions
  const handleSaveChannel = async (form: ChannelFormState, id?: string) => {
    if (!form.name || !form.base_url || !form.priority) {
      feedbackToast.error("请先填写名称、地址和优先级");
      return false;
    }
    if (!id && !form.api_key) {
      feedbackToast.error("新增渠道必须填写密钥");
      return false;
    }

    setBusy("save", true);
    try {
      const res = await fetch("/api/admin/ai-channels", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: form.name.trim(),
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim() || undefined,
          model: form.model.trim() || null,
          priority: Number.parseInt(form.priority, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "保存失败");

      if (!id && data.channel?.id) {
        updateSelection(data.channel.id, false);
      }

      feedbackToast.success(id ? "渠道已更新" : "渠道已新增");
      notifyChannelsChanged();
      await loadData(true);
      return true;
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "保存失败");
      return false;
    } finally {
      setBusy("save", false);
    }
  };

  const handleChannelAction = async (id: string, action: "test" | "ocr_test" | "toggle" | "recover" | "delete", isEnabled?: boolean) => {
    setBusy(`${action}:${id}`, true);

    try {
      let res: Response;
      if (action === "test" || action === "ocr_test") {
        res = await fetch("/api/admin/ai-channels/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: id, test_kind: action === "ocr_test" ? "ocr" : "text" }),
        });
      } else if (action === "recover") {
        res = await fetch("/api/admin/ai-channels/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: id }),
        });
      } else if (action === "toggle") {
        res = await fetch("/api/admin/ai-channels", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, is_enabled: isEnabled }),
        });
      } else {
        res = await fetch(`/api/admin/ai-channels?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      }

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "操作失败");

      if (action === "test" || action === "ocr_test") {
        feedbackToast.success(`${action === "ocr_test" ? "截图 OCR" : "文本"}测试成功${data.elapsed_ms ? ` (${data.elapsed_ms}ms)` : ""}`);
      } else if (action === "toggle") {
        feedbackToast.success(isEnabled ? "已启用渠道" : "已禁用渠道");
      } else if (action === "recover") {
        feedbackToast.success("已手动恢复渠道");
      } else {
        feedbackToast.success("已删除渠道");

        const remainingChannels = channelsRef.current.filter((channel) => channel.id !== id);
        setChannels(remainingChannels);
        setFeatures((prev) =>
          prev.map((feature) =>
            feature.channel_id === id
              ? {
                  ...feature,
                  channel_id: "",
                  channel_name: null,
                }
              : feature,
          ),
        );

        if (selectedChannelIdRef.current === id) {
          updateSelection(
            resolveSelectedChannelId({
              channels: remainingChannels,
              currentSelectedChannelId: null,
              isCreatingChannel: false,
            }),
            false,
          );
        }
      }

      if (action === "toggle" || action === "recover" || action === "delete") {
        notifyChannelsChanged();
      }
      await loadData(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败";
      feedbackToast.error(message);
    } finally {
      setBusy(`${action}:${id}`, false);
      if (action === "delete") setDeleteTarget(null);
    }
  };

  // Feature Actions (Auto-save)
  const queueFeatureSave = (id: string) => {
    clearFeatureSaveTimer(id);
    timersRef.current[id] = setTimeout(() => {
      void saveFeature(id);
    }, DEBOUNCE_MS);
  };

  const scheduleFeatureSaveStateReset = (id: string, version: number) => {
    clearFeatureFeedbackTimer(id);
    saveFeedbackTimersRef.current[id] = setTimeout(() => {
      if (!isFeatureVersionCurrent(featureVersionRef.current[id], version)) return;

      const current = featuresRef.current.find((feature) => feature.id === id);
      if (!current || getFeaturePayloadKey(current) !== lastSavedRef.current[id]) return;

      setFeatureSaveStates((prev) => ({ ...prev, [id]: "idle" }));
    }, FEATURE_SAVE_FEEDBACK_MS);
  };

  const saveFeature = async (id: string) => {
    const current = featuresRef.current.find((f) => f.id === id);
    if (!current) return;

    const version = featureVersionRef.current[id] ?? 0;
    const payload = buildFeatureSavePayload(current);
    const payloadKey = getFeaturePayloadKey(payload);
    if (lastSavedRef.current[id] === payloadKey) {
      setFeatureSaveStates((p) => ({ ...p, [id]: "idle" }));
      return;
    }

    setFeatureSaveStates((p) => ({ ...p, [id]: "saving" }));

    try {
      const res = await fetch("/api/admin/ai-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "保存失败");

      if (!isFeatureVersionCurrent(featureVersionRef.current[id], version)) return;

      const saved = normalizeFeatureItem(data.feature as AiFeatureApiRow);
      lastSavedRef.current[id] = getFeaturePayloadKey(saved);

      setFeatures((p) => p.map((f) => (f.id === id ? saved : f)));
      setFeatureSaveStates((p) => ({ ...p, [id]: "saved" }));

      scheduleFeatureSaveStateReset(id, version);
    } catch (err) {
      if (!isFeatureVersionCurrent(featureVersionRef.current[id], version)) return;
      setFeatureSaveStates((p) => ({ ...p, [id]: "error" }));
      clearFeatureFeedbackTimer(id);

      // 第3批优化：自动保存失败时，需要管理员介入，因此保留 Toast
      const message = err instanceof Error ? err.message : "保存失败";
      feedbackToast.error(`${current.label} 保存失败：${message}`);
    }
  };

  const handleFeaturePatch = (id: string, patch: Record<string, unknown>) => {
    setFeatures((prev) => {
      let nextFeature: AiFeatureItem | null = null;
      const next = prev.map((f) => {
        if (f.id !== id) return f;
        nextFeature = applyFeaturePatch(f, patch);
        return nextFeature;
      });

      if (nextFeature) {
        featureVersionRef.current[id] = (featureVersionRef.current[id] ?? 0) + 1;
        const nextPayloadKey = getFeaturePayloadKey(nextFeature);

        if (nextPayloadKey === lastSavedRef.current[id]) {
          clearFeatureSaveTimer(id);
          clearFeatureFeedbackTimer(id);
          setFeatureSaveStates((cur) => ({ ...cur, [id]: "idle" }));
          return next;
        }

        clearFeatureFeedbackTimer(id);
        setFeatureSaveStates((cur) => ({ ...cur, [id]: "pending" }));
        queueFeatureSave(id);
      }
      return next;
    });
  };

  const activeChannel = !isCreatingChannel ? channels.find((channel) => channel.id === selectedChannelId) || null : null;

  const buildChannelHref = (channelId: string | "__new__") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("channel", channelId);
    return `/admin/ai-channels?${params.toString()}`;
  };

  return (
    <div className="w-full space-y-4">
      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
          <div className="flex flex-col items-center gap-3 text-[var(--color-text-secondary)]">
            <Skeleton className="size-6 rounded-full" />
            <p className="text-[12px] font-medium text-zinc-800">加载中…</p>
          </div>
        </div>
      ) : (
        <div id="ai-channels" className="relative scroll-mt-8">
          {/* Top row: Channel list (left, 260px) + Channel detail form (right, fluid) */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
            {/* Left: Channel list — 与下方「AI 功能绑定」master 列表 260px 对齐 */}
            <aside
              aria-label="渠道列表"
              className="flex w-full flex-col gap-2 self-stretch rounded-2xl border border-zinc-200 bg-zinc-50 p-3 xl:w-[260px] xl:shrink-0"
            >
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                  渠道
                </p>
                <Link
                  href={buildChannelHref("__new__")}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors duration-150",
                    isCreatingChannel ? "text-[#D97757]" : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  <Plus className="size-3 stroke-[1.5]" />
                  <span>添加</span>
                </Link>
              </div>

              {channels.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-zinc-400">暂无渠道</p>
              ) : (
                <ul className="space-y-1">
                  {channels.map((channel) => {
                    const active = !isCreatingChannel && selectedChannelId === channel.id;
                    return (
                      <li key={channel.id}>
                        <Link
                          href={buildChannelHref(channel.id)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex items-center gap-2 overflow-hidden rounded-lg px-3 py-2.5 text-[13px] leading-[1.5] tracking-tight transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                            active
                              ? "bg-white font-semibold text-zinc-800 ring-1 ring-inset ring-[#D97757]/30"
                              : "font-medium text-zinc-600 hover:bg-white hover:text-zinc-800",
                          )}
                        >
                          {active && (
                            <span
                              className="pointer-events-none absolute inset-y-1.5 left-0 w-[2px] rounded-r-full bg-[#D97757]"
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate pl-1">{channel.name}</span>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              getChannelStatusColor(channel),
                            )}
                            aria-hidden
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            {/* Right: Channel detail form */}
            <div
              key={activeChannel?.id ?? (isCreatingChannel ? "new" : "empty")}
              className="flex min-w-0 flex-1 animate-in fade-in duration-300 ease-out fill-mode-both [&>*]:flex-1"
            >
              <ChannelDetailForm
                channel={activeChannel}
                onSave={handleSaveChannel}
                onTest={(id, kind) => handleChannelAction(id, kind === "ocr" ? "ocr_test" : "test")}
                onToggle={(id, isEnabled) => handleChannelAction(id, "toggle", isEnabled)}
                onRecover={(id) => handleChannelAction(id, "recover")}
                onDeleteClick={setDeleteTarget}
                busyActions={busyActions}
              />
            </div>
          </div>

          {/* AI Feature Bindings (full width) */}
          <section id="ai-features" className="mt-6 scroll-mt-8 space-y-4">
            <div className="flex flex-col gap-1 border-l-2 border-[#D97757] pl-3">
              <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">AI 功能绑定</h2>
              <p className="text-[12px] text-zinc-500">每个功能可独立指定接管渠道与模型，留空走 failover；编辑实时自动保存。</p>
            </div>

            <ChannelFeatureBindings
              channelId={activeChannel?.id ?? null}
              channels={channels}
              features={features}
              saveStates={featureSaveStates}
              onFeaturePatch={handleFeaturePatch}
            />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除渠道"
        description={deleteTarget ? `确定删除「${deleteTarget.name}」吗？绑定的功能将自动重置为"自动分配"。` : undefined}
        confirmText="删除"
        cancelText="取消"
        destructive
        loading={busyActions[`delete:${deleteTarget?.id ?? ""}`]}
        onConfirm={() => {
          if (deleteTarget) {
            void handleChannelAction(deleteTarget.id, "delete");
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
