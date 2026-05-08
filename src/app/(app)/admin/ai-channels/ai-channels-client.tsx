"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { ChannelSidebar } from "./components/channel-sidebar";
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
const SELECTION_STORAGE_KEY = "dydata:admin:ai-channels:selected-channel-id";

export default function AIChannelsClient() {
  // State
  const [channels, setChannels] = useState<AiChannelRow[]>([]);
  const [features, setFeatures] = useState<AiFeatureItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);

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

  const updateSelection = useCallback((nextChannelId: string | null, nextIsCreatingChannel = false) => {
    selectedChannelIdRef.current = nextChannelId;
    isCreatingChannelRef.current = nextIsCreatingChannel;
    setSelectedChannelId(nextChannelId);
    setIsCreatingChannel(nextIsCreatingChannel);
  }, []);

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

    if (typeof window !== "undefined") {
      const storedSelection = window.sessionStorage.getItem(SELECTION_STORAGE_KEY);
      if (storedSelection) {
        selectedChannelIdRef.current = storedSelection;
        setSelectedChannelId(storedSelection);
      }
    }

    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isCreatingChannel || !selectedChannelId) {
      window.sessionStorage.removeItem(SELECTION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(SELECTION_STORAGE_KEY, selectedChannelId);
  }, [isCreatingChannel, selectedChannelId]);

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

  return (
    <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      {/* 极简顶部导航 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950">AI 功能区</h1>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[var(--color-text-secondary)]">
          <Link href="/admin" className="flex items-center gap-1.5 hover:text-zinc-950 transition-colors">
            返回总控台
          </Link>
          <div className="h-3.5 w-px bg-border/60" />
          <Link href="/admin/ai-rewrite" className="flex items-center gap-1.5 hover:text-zinc-950 transition-colors">
            文案改写配置
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-4 text-[var(--color-text-secondary)]">
            <div className="size-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-950" />
            <p className="font-medium text-zinc-950">加载数据中...</p><p className="text-xs text-zinc-500">正在获取渠道与绑定配置</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start relative overflow-hidden">
          <ChannelSidebar
            channels={channels}
            selectedChannelId={isCreatingChannel ? null : selectedChannelId}
            onSelect={(id) => updateSelection(id, false)}
            onAddClick={() => updateSelection(null, true)}
          />

          <div
            key={activeChannel?.id ?? (isCreatingChannel ? "new" : "empty")}
            className="flex-1 min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both"
          >
            <div className="space-y-6">
              <ChannelDetailForm
                channel={activeChannel}
                onSave={handleSaveChannel}
                onTest={(id, kind) => handleChannelAction(id, kind === "ocr" ? "ocr_test" : "test")}
                onToggle={(id, isEnabled) => handleChannelAction(id, "toggle", isEnabled)}
                onRecover={(id) => handleChannelAction(id, "recover")}
                onDeleteClick={setDeleteTarget}
                busyActions={busyActions}
              />

              <ChannelFeatureBindings
                channelId={activeChannel?.id ?? null}
                channels={channels}
                features={features}
                saveStates={featureSaveStates}
                onFeaturePatch={handleFeaturePatch}
              />
            </div>
          </div>
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
