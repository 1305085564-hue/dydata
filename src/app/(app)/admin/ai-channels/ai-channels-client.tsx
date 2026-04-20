"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeInfo, Settings2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { ChannelSidebar } from "./components/channel-sidebar";
import { ChannelDetailForm } from "./components/channel-detail-form";
import { ChannelFeatureBindings } from "./components/channel-feature-bindings";
import { AiChannelRow, AiFeatureItem, ChannelFormState } from "./components/types";

const DEBOUNCE_MS = 500;

export default function AIChannelsClient() {
  // State
  const [channels, setChannels] = useState<AiChannelRow[]>([]);
  const [features, setFeatures] = useState<AiFeatureItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  
  // Loading & Action State
  const [isLoading, setIsLoading] = useState(true);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const [featureSaveStates, setFeatureSaveStates] = useState<Record<string, "idle" | "pending" | "saving" | "saved" | "error">>({});
  const [deleteTarget, setDeleteTarget] = useState<AiChannelRow | null>(null);

  // Refs for debouncing auto-save
  const featuresRef = useRef<AiFeatureItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const requestSeqRef = useRef<Record<string, number>>({});
  const lastSavedRef = useRef<Record<string, string>>({});

  useEffect(() => { featuresRef.current = features; }, [features]);

  // Initial Load
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [cRes, fRes] = await Promise.all([
        fetch("/api/admin/ai-channels", { cache: "no-store" }),
        fetch("/api/admin/ai-features", { cache: "no-store" })
      ]);
      
      const cData = await cRes.json();
      const fData = await fRes.json();
      
      if (!cRes.ok || cData.error) throw new Error(cData.error || "加载渠道失败");
      if (!fRes.ok || fData.error) throw new Error(fData.error || "加载功能失败");
      
      const loadedChannels = Array.isArray(cData.channels) ? cData.channels : [];
      setChannels(loadedChannels.sort((a: AiChannelRow, b: AiChannelRow) => a.priority - b.priority || a.name.localeCompare(b.name, "zh-CN")));
      
      const loadedFeatures = Array.isArray(fData.features) ? fData.features.map((f: any) => ({
        ...f,
        channel_id: f.channel_id ?? "",
        model: f.model ?? "",
        system_prompt: f.system_prompt ?? ""
      })) : [];
      
      setFeatures(loadedFeatures);
      
      // Init save cache
      const nextSaved: Record<string, string> = {};
      for (const f of loadedFeatures) nextSaved[f.id] = JSON.stringify({
        id: f.id, channel_id: f.channel_id || null, model: f.model || null, system_prompt: f.system_prompt || null, is_enabled: f.is_enabled
      });
      lastSavedRef.current = nextSaved;

      // Select first channel if none selected and not adding new
      if (loadedChannels.length > 0 && selectedChannelId === null) {
        setSelectedChannelId(loadedChannels[0].id);
      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  // Set action busy state
  const setBusy = (key: string, isBusy: boolean) => {
    setBusyActions(prev => ({ ...prev, [key]: isBusy }));
  };

  // Channel Actions
  const handleSaveChannel = async (form: ChannelFormState, id?: string) => {
    if (!form.name || !form.base_url || !form.priority) {
      feedbackToast.error("请先填写名称、地址和优先级");
      return;
    }
    if (!id && !form.api_key) {
      feedbackToast.error("新增渠道必须填写密钥");
      return;
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

      feedbackToast.success(id ? "渠道已更新" : "渠道已新增");
      await loadData(true);
      
      if (!id && data.channel?.id) {
        setSelectedChannelId(data.channel.id);
      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "保存失败");
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
        feedbackToast.success(`${action === "ocr_test" ? "截图 OCR" : "文本"}测试成功${data.elapsed_ms ? ` (${data.elapsed_ms}ms)` : ''}`);
      } else if (action === "toggle") {
        feedbackToast.success(isEnabled ? "已启用渠道" : "已禁用渠道");
      } else if (action === "recover") {
        feedbackToast.success("已手动恢复渠道");
      } else {
        feedbackToast.success("已删除渠道");
        if (selectedChannelId === id) setSelectedChannelId(channels.length > 1 ? channels.find(c => c.id !== id)?.id || null : null);
      }

      await loadData(true);
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(`${action}:${id}`, false);
      if (action === "delete") setDeleteTarget(null);
    }
  };

  // Feature Actions (Auto-save)
  const queueFeatureSave = (id: string) => {
    const timer = timersRef.current[id];
    if (timer) clearTimeout(timer);
    timersRef.current[id] = setTimeout(() => { void saveFeature(id); }, DEBOUNCE_MS);
  };

  const saveFeature = async (id: string) => {
    const current = featuresRef.current.find((f) => f.id === id);
    if (!current) return;
    
    const payload = {
      id: current.id,
      channel_id: current.channel_id.trim() ? current.channel_id : null,
      model: current.model.trim() ? current.model.trim() : null,
      system_prompt: current.system_prompt.trim() ? current.system_prompt : null,
      is_enabled: current.is_enabled,
    };
    
    const payloadKey = JSON.stringify(payload);
    if (lastSavedRef.current[id] === payloadKey) {
      setFeatureSaveStates((p) => ({ ...p, [id]: "idle" }));
      return;
    }
    
    const seq = (requestSeqRef.current[id] ?? 0) + 1;
    requestSeqRef.current[id] = seq;
    setFeatureSaveStates((p) => ({ ...p, [id]: "saving" }));
    
    try {
      const res = await fetch("/api/admin/ai-features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "保存失败");
      if (requestSeqRef.current[id] !== seq) return;
      
      const saved = {
        ...data.feature,
        channel_id: data.feature.channel_id ?? "",
        model: data.feature.model ?? "",
        system_prompt: data.feature.system_prompt ?? ""
      };
      
      lastSavedRef.current[id] = JSON.stringify({
        id: saved.id, channel_id: saved.channel_id || null, model: saved.model || null, system_prompt: saved.system_prompt || null, is_enabled: saved.is_enabled
      });
      
      setFeatures((p) => p.map((f) => (f.id === id ? saved : f)));
      setFeatureSaveStates((p) => ({ ...p, [id]: "saved" }));
      
      // Update channel info silently to reflect new bindings if needed
      if (payload.channel_id) loadData(true);
      
    } catch (err) {
      if (requestSeqRef.current[id] !== seq) return;
      setFeatureSaveStates((p) => ({ ...p, [id]: "error" }));
      feedbackToast.error(`${current.label} 保存失败`);
    }
  };

  const handleFeaturePatch = (id: string, patch: Record<string, unknown>) => {
    if ("_clearCustomModel" in patch) {
      const { _clearCustomModel, ...rest } = patch;
      patch = rest;
    }
    
    setFeatures((prev) => {
      let nextFeature: AiFeatureItem | null = null;
      const next = prev.map((f) => {
        if (f.id !== id) return f;
        nextFeature = { ...f, ...patch } as AiFeatureItem;
        return nextFeature;
      });
      
      if (nextFeature) {
        setFeatureSaveStates((cur) => ({ ...cur, [id]: "pending" }));
        queueFeatureSave(id);
      }
      return next;
    });
  };

  const activeChannel = channels.find(c => c.id === selectedChannelId) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">AI System Hub</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">AI 渠道与功能管理</h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                统一管理 AI 渠道和功能绑定。左侧选择渠道，右侧配置信息并指派需要承接的功能。
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
            <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
              <BadgeInfo className="size-3.5 text-[var(--color-primary)]" />
              导航
            </div>
            <div className="space-y-2 pt-1">
              <Link href="/admin" className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]">
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">返回总控台</p>
                </div>
                <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
              </Link>
              <Link href="/admin/ai-rewrite" className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                    <Settings2 className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">文案改写配置</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px]">
          <div className="flex flex-col items-center gap-4 text-[var(--color-text-secondary)]">
            <div className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="font-medium text-[var(--color-text-primary)]">加载数据中...</p><p className="text-xs text-[var(--color-text-secondary)]">正在获取渠道与绑定配置</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start relative overflow-hidden">
          <ChannelSidebar
            channels={channels}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
            onAddClick={() => setSelectedChannelId(null)}
            onToggleEnabled={(id, enabled) => handleChannelAction(id, "toggle", enabled)}
          />

          <div
            key={selectedChannelId || "new"}
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
                channelId={selectedChannelId}
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
