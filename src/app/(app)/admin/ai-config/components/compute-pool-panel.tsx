"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Server, Plus, RotateCcw, Loader2, Activity, Boxes } from "lucide-react";
import { useAiConfig, type AiProvider, type AiProviderKey } from "../hooks/use-ai-config";
import { ModelFamilyCard, type ModelFamilyKeyItem } from "./model-family-card";
import { AddKeyDialog } from "./add-key-dialog";
import { ProviderDialog, KeyDialog, ProvidersManagerDialog } from "./providers-dialogs";
import { SyncModelsDialog } from "./sync-models-dialog";
import {
  ModelManagerDialog,
  KeyTestResultsBar,
  SyncFailedResultsBar,
  type WarehouseModelGroup,
  type KeyTestResultItem,
} from "./shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export function ComputePoolPanel() {
  const {
    bundle,
    mutate,
    mutateEntity,
    swapKeyPriority,
    testKeyConnection,
    checkDependencies,
    setKeyModelSelection,
    refresh,
  } = useAiConfig();

  const [pendingDeletion, setPendingDeletion] = useState<Set<string>>(new Set());
  const deletionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map()); // gate:transient-map 密钥撤回定时器集合，随组件卸载释放
  const [highlightedModels, setHighlightedModels] = useState<string[]>([]);

  // 弹窗状态
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [addKeyModal, setAddKeyModal] = useState<{ open: boolean; providerId: string | null }>({ open: false, providerId: null });
  const [providersManagerOpen, setProvidersManagerOpen] = useState(false);
  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({ open: false, data: null });
  const [editKeyModal, setEditKeyModal] = useState<{ open: boolean; data: Partial<AiProviderKey> | null }>({ open: false, data: null });
  const [syncDialog, setSyncDialog] = useState<{
    open: boolean;
    keyId: string | null;
    keyLabel: string;
    providerName: string;
    availableModels: string[];
    initialSelectedModelIds: string[];
  }>({
    open: false,
    keyId: null,
    keyLabel: "",
    providerName: "",
    availableModels: [],
    initialSelectedModelIds: [],
  });

  // F5: 全池批量操作状态
  const [syncingAll, setSyncingAll] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<{ total: number; results: KeyTestResultItem[] } | null>(null);
  const [syncFailedChannels, setSyncFailedChannels] = useState<Array<{ keyName: string; error: string }> | null>(null);

  useEffect(() => {
    const kTimers = deletionTimers.current;
    return () => {
      kTimers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const stats = useMemo(() => {
    if (!bundle) return { totalProviders: 0, activeKeys: 0, totalKeys: 0, healthRate: 100 };
    const totalProviders = bundle.providers.filter((p) => p.is_enabled).length;
    const activeKeys = bundle.keys.filter((k) => k.is_enabled).length;
    const totalKeys = bundle.keys.length;
    const healthyKeys = bundle.keys.filter((k) => k.is_enabled && k.consecutive_failures === 0).length;
    const healthRate = activeKeys > 0 ? Math.round((healthyKeys / activeKeys) * 100) : 100;
    return { totalProviders, activeKeys, totalKeys, healthRate };
  }, [bundle]);

  const modelFamilyGroups = useMemo(() => {
    if (!bundle) return [];
    const providerMap = new Map(bundle.providers.map((p) => [p.id, p])); // gate:transient-map useMemo内部查找索引，随渲染释放
    const keyMap = new Map(bundle.keys.map((k) => [k.id, k])); // gate:transient-map useMemo内部查找索引，随渲染释放
    const groups = new Map<string, WarehouseModelGroup>(); // gate:transient-map useMemo内部模型分组索引，随渲染释放

    for (const m of bundle.models) {
      const key = keyMap.get(m.key_id);
      if (!key) continue;
      const provider = providerMap.get(key.provider_id);
      if (!provider) continue;

      const modelId = m.model_id;
      const displayName = m.display_name || getModelDisplayName(modelId);

      if (!groups.has(modelId)) {
        groups.set(modelId, { modelId, displayName, items: [], isShelved: m.is_enabled });
      } else if (m.is_enabled) {
        groups.get(modelId)!.isShelved = true;
      }

      groups.get(modelId)!.items.push({ key, providerName: provider.name, modelRecordId: m.id, modelId, displayName });
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => a.key.priority - b.key.priority);
    }
    return Array.from(groups.values());
  }, [bundle]);

  const activeGroups = useMemo(() => modelFamilyGroups.filter((g) => g.isShelved), [modelFamilyGroups]);

  // F2 & F3: 上下架变更逻辑
  const handleShelfChange = async (modelId: string, nextState: boolean) => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_global_model_shelf_state", data: { modelId, is_enabled: nextState } }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || (res.status === 409 ? "独占使用中，禁止下架" : "操作失败") };
      }
      mutate(data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "网络异常" };
    }
  };

  const handleRenameModel = async (modelId: string, modelRecordId: string, newDisplayName: string) => {
    const res = await mutateEntity("update", "model", { id: modelRecordId, display_name: newDisplayName });
    return res.ok;
  };

  const handleDeleteModelPermanent = async (group: WarehouseModelGroup) => {
    try {
      await Promise.all(group.items.map((it) => mutateEntity("delete", "model", { id: it.modelRecordId })));
    } catch {
      feedbackToast.error("删除模型记录异常");
    }
  };

  const handleSyncAll = async () => {
    if (syncingAll || testingAll) return;
    setSyncingAll(true);
    // 点击那一刻从当前 bundle 取一次快照（以每个 model 关联的 key_id:model_id 为唯一键）
    const prevModelKeys = new Set((bundle?.models ?? []).map((m) => `${m.key_id}:${m.model_id}`));
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_all_keys" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "模型测试失败");

      const freshBundle = await refresh();
      const failedList = (data.failed ?? []) as Array<{ keyId: string; keyName: string; error: string }>;

      // 仅当拿到 freshBundle 时才计算真实新增数；拿不到时绝不猜0或假造
      const hasFresh = Boolean(freshBundle?.models);
      const newAddedCount = hasFresh
        ? freshBundle!.models.filter((m) => !prevModelKeys.has(`${m.key_id}:${m.model_id}`)).length
        : null;

      const newPart = newAddedCount !== null ? `：新发现 ${newAddedCount} 个模型存入仓库` : "";

      if (failedList.length > 0) {
        feedbackToast.warning(
          `已测试 ${data.total} 个渠道${newPart}，${failedList.length} 个渠道探测失败`,
          {
            action: {
              label: "查看原因",
              onClick: () => {
                setSyncFailedChannels(failedList);
              },
            },
          }
        );
      } else {
        feedbackToast.success(`已测试 ${data.total} 个渠道${newPart}`);
      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "模型测试失败");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleTestAll = async () => {
    if (syncingAll || testingAll) return;
    setTestingAll(true);
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_all_keys" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "渠道测试失败");
      setTestResults(data);
      const okCount = data.results.filter((r: KeyTestResultItem) => r.ok).length;
      feedbackToast.success(`已完成渠道测试：${okCount}/${data.total} 个渠道在线`);
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "渠道测试失败");
    } finally {
      setTestingAll(false);
    }
  };

  const startPendingDelete = (keyId: string) => {
    setPendingDeletion((prev) => new Set(prev).add(keyId));
    feedbackToast.warning("已删除密钥，5 秒内可撤回", {
      duration: 5000,
      action: {
        label: "撤回",
        onClick: () => handleUndoDelete(keyId),
      },
    });
    const timer = setTimeout(async () => {
      await mutateEntity("delete", "key", { id: keyId });
      setPendingDeletion((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
      deletionTimers.current.delete(keyId);
    }, 5000);
    deletionTimers.current.set(keyId, timer);
  };

  const handleUndoDelete = (keyId: string) => {
    const timer = deletionTimers.current.get(keyId);
    if (timer) clearTimeout(timer);
    deletionTimers.current.delete(keyId);
    setPendingDeletion((prev) => {
      const next = new Set(prev);
      next.delete(keyId);
      return next;
    });
    feedbackToast.success("已撤回删除");
  };

  const handleDeleteWithCheck = async (keyId: string) => {
    const deps = await checkDependencies(keyId);
    if (deps.criticalBindings.length > 0) {
      const names = deps.criticalBindings.map((b) => b.label).join("、");
      feedbackToast.error(`此密钥正在被【${names}】使用，且无可用备用模型，禁止删除`);
      return;
    }
    if (deps.affectedBindings.length > 0) {
      feedbackToast.warning(`此密钥正在被 ${deps.affectedBindings.length} 个功能使用，删除后将自动切换到备用模型`, {
        action: { label: "继续删除", onClick: () => startPendingDelete(keyId) },
      });
      return;
    }
    startPendingDelete(keyId);
  };

  const triggerHighlight = (modelIds: string[]) => {
    if (modelIds.length === 0) return;
    setHighlightedModels(modelIds);
    setTimeout(() => {
      const el = document.querySelector(`[data-model-id="${modelIds[0]}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setHighlightedModels([]), 3000);
  };

  return (
    <div className="space-y-3">
      {/* 算力概览条 */}
      <div className="group/overview flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E2DF] bg-white px-3.5 py-2.5 shadow-input">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#1F1E1D]">
          <div><span className="text-[#78716C] mr-1">服务商</span><span className="font-medium text-[#141413]">{stats.totalProviders} 家</span></div>
          <span className="text-[#E2E2DF]">·</span>
          <div><span className="text-[#78716C] mr-1">活跃密钥</span><span className="font-medium text-[#141413]">{stats.activeKeys} 个</span></div>
          <span className="text-[#E2E2DF]">·</span>
          <div><span className="text-[#78716C] mr-1">健康率</span><span className="font-medium text-[#6FAA7D]">{stats.healthRate}%</span></div>
        </div>

        <div className="flex items-center gap-2">
          {/* 前两个一键：划入才显示，默认隐藏 */}
          <div className="flex items-center gap-1.5 opacity-0 max-w-0 overflow-hidden pointer-events-none group-hover/overview:opacity-100 group-hover/overview:max-w-xs group-hover/overview:pointer-events-auto transition-all duration-300 ease-out">
            <Button variant="outline" size="s" className="h-7 px-2 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0" disabled={syncingAll || testingAll} onClick={handleSyncAll}>
              {syncingAll ? <Loader2 className="size-3.5 mr-1 animate-spin text-[#78716C]" /> : <RotateCcw className="size-3.5 mr-1 text-[#78716C]" />}
              一键模型测试
            </Button>
            <Button variant="outline" size="s" className="h-7 px-2 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0" disabled={syncingAll || testingAll} onClick={handleTestAll}>
              {testingAll ? <Loader2 className="size-3.5 mr-1 animate-spin text-[#78716C]" /> : <Activity className="size-3.5 mr-1 text-[#78716C]" />}
              一键渠道测试
            </Button>
          </div>

          {/* 模型管理：集中挑选开启/关闭模型 */}
          <Button variant="outline" size="s" className="h-7 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]" onClick={() => setModelManagerOpen(true)}>
            <Boxes className="size-3.5 mr-1 text-[#78716C]" />
            模型管理
          </Button>
          <Button variant="outline" size="s" className="h-7 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]" onClick={() => setProvidersManagerOpen(true)}>
            <Server className="size-3.5 mr-1 text-[#78716C]" />
            管理服务商
          </Button>
          <Button size="s" className="h-7 px-3 text-[12px] gap-1 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input" onClick={() => setAddKeyModal({ open: true, providerId: null })}>
            <Plus className="size-3.5" />
            接入渠道
          </Button>
        </div>
      </div>

      {/* 按模型聚合的可用算力池（主列表只显示已上架模型） */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-[14px] font-medium text-[#141413] tracking-tight">现役在册模型</span>
            <span className="text-[12px] text-[#78716C]">(共 {activeGroups.length} 个已开启)</span>
          </div>
          <span className="text-[12px] text-[#78716C] hidden sm:inline">按顺位与健康度自动调度切流，保障业务从容运转</span>
        </div>

        {activeGroups.length === 0 ? (
          <div className="rounded-xl border border-[#E2E2DF] bg-white p-8 text-center text-[12px] text-[#78716C] space-y-2 shadow-input">
            <p className="font-serif text-[14px] text-[#141413]">暂无现役在册模型</p>
            <p className="text-[#A8A29E]">点击上方【模型管理】开启所需模型，或接入新渠道开启调度。</p>
            <div>
              <Button size="s" variant="outline" onClick={() => setModelManagerOpen(true)} className="h-7 text-[12px] border-[#E2E2DF]">
                打开模型管理
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGroups.map((group) => (
              <ModelFamilyCard
                key={group.modelId}
                modelId={group.modelId}
                displayName={group.displayName}
                items={group.items}
                highlightedModelIds={highlightedModels}
                pendingDeletionKeys={pendingDeletion}
                isShelved={group.isShelved}
                onShelfChange={handleShelfChange}
                onRenameModel={handleRenameModel}
                onTestKey={testKeyConnection}
                onEditKey={(key) => setEditKeyModal({ open: true, data: key })}
                onDeleteKeyWithCheck={handleDeleteWithCheck}
                onUndoDeleteKey={handleUndoDelete}
                onAddChannelForModel={() => setAddKeyModal({ open: true, providerId: null })}
                onSwapPriority={async (k1, k2, p1, p2) => {
                  await swapKeyPriority(k1, k2, p1, p2);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* F5: 连通测试临时结果条（在收纳区上方展开，逐渠道列出 在线/失败/超时 与响应耗时） */}
      {testResults && testResults.results.length > 0 && (
        <KeyTestResultsBar testResults={testResults} onClose={() => setTestResults(null)} />
      )}

      {/* F5: 盘点失败明细临时结果条 */}
      {syncFailedChannels && syncFailedChannels.length > 0 && (
        <SyncFailedResultsBar
          failedChannels={syncFailedChannels}
          onClose={() => setSyncFailedChannels(null)}
        />
      )}

      {/* 模型管理集中开闭弹窗 */}
      <ModelManagerDialog
        open={modelManagerOpen}
        onOpenChange={setModelManagerOpen}
        allGroups={modelFamilyGroups}
        providers={bundle?.providers ?? []}
        onToggleShelf={handleShelfChange}
        onDeleteModelPermanent={handleDeleteModelPermanent}
      />

      {/* 新增密钥弹窗 */}
      <AddKeyDialog
        open={addKeyModal.open}
        onOpenChange={(open) => setAddKeyModal({ ...addKeyModal, open })}
        providerId={addKeyModal.providerId}
        onSuccess={(newKeyId) => {
          const newModels = bundle?.models.filter((m) => m.key_id === newKeyId) ?? [];
          triggerHighlight(newModels.map((m) => m.model_id));
        }}
      />

      {/* 服务商管理大弹窗 */}
      <ProvidersManagerDialog
        open={providersManagerOpen}
        onOpenChange={setProvidersManagerOpen}
        onEditProvider={(provider) => setProviderModal({ open: true, data: provider })}
        onCreateProvider={() => setProviderModal({ open: true, data: null })}
      />

      {/* 编辑/新建服务商表单弹窗 */}
      <ProviderDialog
        open={providerModal.open}
        provider={providerModal.data}
        onOpenChange={(open) => setProviderModal({ ...providerModal, open })}
        onSave={async (data) => {
          const action = providerModal.data?.id ? "update" : "create";
          await mutateEntity(action, "provider", data);
          setProviderModal({ open: false, data: null });
        }}
      />

      {/* 编辑密钥弹窗 */}
      <KeyDialog
        open={editKeyModal.open}
        apiKey={editKeyModal.data}
        providerId={editKeyModal.data?.provider_id || null}
        onOpenChange={(open) => setEditKeyModal({ ...editKeyModal, open })}
        onSave={async (data) => {
          await mutateEntity("update", "key", data);
          setEditKeyModal({ open: false, data: null });
        }}
      />

      {/* 自定义模型勾选弹窗 */}
      <SyncModelsDialog
        open={syncDialog.open}
        keyId={syncDialog.keyId}
        keyLabel={syncDialog.keyLabel}
        providerName={syncDialog.providerName}
        availableModels={syncDialog.availableModels}
        initialSelectedModelIds={syncDialog.initialSelectedModelIds}
        onOpenChange={(open) => setSyncDialog({ ...syncDialog, open })}
        onSave={async (kId, mIds) => {
          const ok = await setKeyModelSelection(kId, mIds);
          if (ok) triggerHighlight(mIds);
          return ok;
        }}
      />
    </div>
  );
}
