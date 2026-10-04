"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Server, Plus, RotateCcw, Loader2, Activity, Boxes, Search } from "lucide-react";
import { useAiConfig, type AiProvider, type AiProviderKey } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { ModelFamilyCard } from "./model-family-card";
import { AddKeyDialog } from "./add-key-dialog";
import { ProviderDialog, KeyDialog, ProvidersManagerDialog } from "./providers-dialogs";
import { SyncModelsDialog } from "./sync-models-dialog";
import { ChannelPoolView, PoolViewSwitcher } from "./channel-pool-view";
import {
  ModelManagerDialog,
  KeyTestResultsBar,
  SyncFailedResultsBar,
  type WarehouseModelGroup,
  type KeyTestResultItem,
} from "./shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { presentError } from "@/lib/ai-config/presentation";

type PoolStatusFilter = "all" | "fault" | "no_channel";

export function ComputePoolPanel({ noChannelNonce = 0 }: { noChannelNonce?: number }) {
  const {
    bundle,
    mutate,
    mutateEntity,
    swapKeyPriority,
    testKeyConnection,
    checkDependencies,
    setKeyModelSelection,
    syncKeyModels,
    refresh,
  } = useAiConfig();

  const [pendingDeletion, setPendingDeletion] = useState<Set<string>>(new Set());
  // gate:transient-map 密钥撤回定时器集合，随组件卸载释放
  const deletionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // gate:transient-map 撤回倒计时截止时间，随组件卸载释放
  const deletionDeadlines = useRef<Map<string, number>>(new Map());
  const [deletionNow, setDeletionNow] = useState(() => Date.now()); const poolRootRef = useRef<HTMLDivElement>(null); const [pendingNoChannelFocus, setPendingNoChannelFocus] = useState(false);
  const [highlightedModels, setHighlightedModels] = useState<string[]>([]);
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [addKeyModal, setAddKeyModal] = useState<{ open: boolean; providerId: string | null }>({ open: false, providerId: null });
  const [providersManagerOpen, setProvidersManagerOpen] = useState(false);
  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({ open: false, data: null });
  const [editKeyModal, setEditKeyModal] = useState<{ open: boolean; data: Partial<AiProviderKey> | null }>({ open: false, data: null });
  const [viewMode, setViewMode] = useState<"model" | "channel">("model");
  const [syncDialog, setSyncDialog] = useState<{
    open: boolean; keyId: string | null; keyLabel: string; providerName: string; availableModels: string[]; initialSelectedModelIds: string[];
  }>({ open: false, keyId: null, keyLabel: "", providerName: "", availableModels: [], initialSelectedModelIds: [] });

  const [syncingAll, setSyncingAll] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<{ total: number; results: KeyTestResultItem[] } | null>(null);
  const [syncFailedChannels, setSyncFailedChannels] = useState<Array<{ keyName: string; error: string }> | null>(null);

  const [searchText, setSearchText] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<PoolStatusFilter>("all");

  useEffect(() => { if (!pendingDeletion.size) return; const interval = window.setInterval(() => setDeletionNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [pendingDeletion.size]);
  useEffect(() => { if (noChannelNonce > 0) { setStatusFilter("no_channel"); setPendingNoChannelFocus(true); } }, [noChannelNonce]);

  useEffect(() => { const kTimers = deletionTimers.current; const deadlines = deletionDeadlines.current; return () => { kTimers.forEach((t) => clearTimeout(t)); deadlines.clear(); }; }, []);

  const stats = useMemo(() => {
    if (!bundle) return { totalProviders: 0, activeKeys: 0, totalKeys: 0 };
    return {
      totalProviders: bundle.providers.filter((p) => p.is_enabled).length,
      activeKeys: bundle.keys.filter((k) => k.is_enabled).length,
      totalKeys: bundle.keys.length,
    };
  }, [bundle]);

  const report = useAvailabilityReport(bundle);

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

  const filteredGroups = useMemo(() => {
    const familyByModelId = new Map((report?.modelFamilies ?? []).map((f) => [f.modelId, f])); // gate:transient-map useMemo计算内部查找索引，随渲染释放
    const keyword = searchText.trim().toLowerCase();
    return activeGroups.filter((g) => {
      if (
        keyword &&
        !g.displayName.toLowerCase().includes(keyword) &&
        !g.modelId.toLowerCase().includes(keyword)
      ) {
        return false;
      }
      if (providerFilter !== "all" && !g.items.some((it) => it.key.provider_id === providerFilter)) {
        return false;
      }
      if (statusFilter !== "all") {
        const family = familyByModelId.get(g.modelId);
        if (statusFilter === "fault" && (family?.faultChannelCount ?? 0) === 0) return false;
        if (statusFilter === "no_channel" && (family?.schedulableChannelCount ?? 0) !== 0) return false;
      }
      return true;
    });
  }, [activeGroups, report, searchText, providerFilter, statusFilter]);

  useEffect(() => { if (!pendingNoChannelFocus) return; poolRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); if (!filteredGroups.length) feedbackToast.warning("异常已恢复，请刷新"); setPendingNoChannelFocus(false); }, [pendingNoChannelFocus, filteredGroups]);

  const hasActiveFilters = searchText.trim() !== "" || providerFilter !== "all" || statusFilter !== "all";
  // gate:transient-map 撤回倒计时展示索引，仅随待删除状态短暂存在
  const pendingDeletionRemaining = useMemo(() => new Map(Array.from(pendingDeletion).map((keyId) => [keyId, Math.max(0, Math.ceil(((deletionDeadlines.current.get(keyId) ?? deletionNow) - deletionNow) / 1000))] as [string, number])), [pendingDeletion, deletionNow]);

  const clearPoolFilters = () => {
    setSearchText("");
    setProviderFilter("all");
    setStatusFilter("all");
  };

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
    const results = await Promise.all(group.items.map((it) => mutateEntity("delete", "model", { id: it.modelRecordId })));
    const okCount = results.filter((r) => r.ok).length;
    const failed = group.items.filter((_, i) => !results[i]?.ok).map((it) => it.displayName);
    await refresh();
    if (okCount === results.length) feedbackToast.success(`已删除 ${okCount} 条模型记录`);
    else feedbackToast.error(`已删除 ${okCount} 条，${results.length - okCount} 条失败：${failed.join("、")}`);
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
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "模型测试失败"));
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
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "渠道测试失败"));
    } finally {
      setTestingAll(false);
    }
  };

  const handleSyncKeyModels = async (key: AiProviderKey) => { const result = await syncKeyModels(key.id); if (!result) return; const selected = (bundle?.models ?? []).filter((m) => m.key_id === key.id && m.is_enabled).map((m) => m.model_id); const provider = bundle?.providers.find((p) => p.id === key.provider_id); setSyncDialog({ open: true, keyId: key.id, keyLabel: key.label, providerName: provider?.name ?? "", availableModels: result.models, initialSelectedModelIds: selected }); };

  const startPendingDelete = (keyId: string) => {
    deletionDeadlines.current.set(keyId, Date.now() + 5000); setDeletionNow(Date.now());
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
      deletionDeadlines.current.delete(keyId);
      deletionTimers.current.delete(keyId);
    }, 5000);
    deletionTimers.current.set(keyId, timer);
  };

  const handleUndoDelete = (keyId: string) => {
    const timer = deletionTimers.current.get(keyId);
    if (timer) clearTimeout(timer);
    deletionTimers.current.delete(keyId);
    deletionDeadlines.current.delete(keyId);
    setPendingDeletion((prev) => {
      const next = new Set(prev);
      next.delete(keyId);
      return next;
    });
    feedbackToast.success("已撤回删除");
  };

  const handleDeleteWithCheck = async (keyId: string) => {
    const deps = await checkDependencies(keyId);
    if (!deps.ok) {
      feedbackToast.error("依赖检查失败，请稍后重试");
      return;
    }
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
    setTimeout(() => setHighlightedModels([]), 2000);
  };

  return (
    <div ref={poolRootRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E2DF] bg-white px-3.5 py-2.5 shadow-input">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#1F1E1D]">
          <div><span className="text-[#78716C] mr-1">服务商</span><span className="font-medium text-[#141413]">{stats.totalProviders} 家</span></div>
          <span className="text-[#E2E2DF]">·</span>
          <div><span className="text-[#78716C] mr-1">启用密钥</span><span className="font-medium text-[#141413]">{stats.activeKeys}/{stats.totalKeys}</span></div>
          <span className="text-[#E2E2DF]">·</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="s" className="h-7 px-2 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0" disabled={syncingAll || testingAll} onClick={handleSyncAll}>
            {syncingAll ? <Loader2 className="size-3.5 mr-1 animate-spin text-[#78716C]" /> : <RotateCcw className="size-3.5 mr-1 text-[#78716C]" />}
            探测并同步模型
          </Button>
          <Button variant="outline" size="s" className="h-7 px-2 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0" disabled={syncingAll || testingAll} onClick={handleTestAll}>
            {testingAll ? <Loader2 className="size-3.5 mr-1 animate-spin text-[#78716C]" /> : <Activity className="size-3.5 mr-1 text-[#78716C]" />}
            测试全部渠道
          </Button>

          {/* 模型管理：集中挑选开启/关闭模型 */}
          <Button variant="outline" size="s" className="h-7 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]" onClick={() => setModelManagerOpen(true)}>
            <Boxes className="size-3.5 mr-1 text-[#78716C]" />
            模型管理
          </Button>
          <Button variant="outline" size="s" className="h-7 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]" onClick={() => setProvidersManagerOpen(true)}>
            <Server className="size-3.5 mr-1 text-[#78716C]" />
            渠道管理
          </Button>
          <Button size="s" className="h-7 px-3 text-[12px] gap-1 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input" onClick={() => setAddKeyModal({ open: true, providerId: null })}>
            <Plus className="size-3.5" />
            接入渠道
          </Button>
        </div>
      </div>

      {/* 连通测试临时结果条（在概览条操作按钮正下方展开） */}
      {testResults && testResults.results.length > 0 && (
        <KeyTestResultsBar testResults={testResults} onClose={() => setTestResults(null)} />
      )}

      {/* 盘点失败明细临时结果条 */}
      {syncFailedChannels && syncFailedChannels.length > 0 && (
        <SyncFailedResultsBar
          failedChannels={syncFailedChannels}
          onClose={() => setSyncFailedChannels(null)}
        />
      )}

      {viewMode === "model" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-[#1F1E1D]">现役在册模型</span>
              <span className="text-[12px] text-[#78716C]">
                {hasActiveFilters
                  ? `(筛选出 ${filteredGroups.length}/${activeGroups.length} 个)`
                  : `(共 ${activeGroups.length} 个已开启)`}
              </span>
            </div>
            <PoolViewSwitcher viewMode={viewMode} onChange={setViewMode} />
          </div>

          {activeGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索模型"
                  className="h-8 w-44 rounded-md border border-[#E2E2DF] bg-white pl-7 pr-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[12px] placeholder:text-[#A8A29E] transition-colors focus:border-[#78716C] focus:outline-none"
                />
              </div>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-8 w-fit rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input transition-colors focus:border-[#78716C] focus:outline-none"
              >
                <option value="all">全部服务商</option>
                {(bundle?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PoolStatusFilter)}
                className="h-8 w-fit rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input transition-colors focus:border-[#78716C] focus:outline-none"
              >
                <option value="all">全部状态</option>
                <option value="fault">仅故障</option>
                <option value="no_channel">仅无可用渠道</option>
              </select>
            </div>
          )}

          {activeGroups.length === 0 ? (
            <EmptyState
              className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
              title="暂无现役在册模型"
              description="点击上方【模型管理】开启所需模型，或接入新渠道开启调度。"
              action={{ label: "打开模型管理", onClick: () => setModelManagerOpen(true) }}
            />
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
              title="没有符合筛选条件的模型"
              description="换个关键词，或清除筛选查看全部在册模型。"
              action={{ label: "清除筛选", onClick: clearPoolFilters }}
            />
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((group) => (
                <ModelFamilyCard
                  key={group.modelId}
                  modelId={group.modelId}
                  displayName={group.displayName}
                  items={group.items}
                  highlightedModelIds={highlightedModels}
                  pendingDeletionKeys={pendingDeletion}
                  pendingDeletionRemaining={pendingDeletionRemaining}
                  isShelved={group.isShelved}
                  onShelfChange={handleShelfChange}
                  onRenameModel={handleRenameModel}
                  onTestKey={testKeyConnection}
                  onSyncKeyModels={handleSyncKeyModels}
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
      ) : (
        <ChannelPoolView
          bundle={bundle}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSyncKeyModels={handleSyncKeyModels}
          onEditKey={(key) => setEditKeyModal({ open: true, data: key })}
          onOpenAddKey={() => setAddKeyModal({ open: true, providerId: null })}
          onRefresh={refresh}
        />
      )}

      {/* 模型管理集中开闭弹窗 */}
      <ModelManagerDialog
        open={modelManagerOpen} onOpenChange={setModelManagerOpen}
        allGroups={modelFamilyGroups} providers={bundle?.providers ?? []}
        onToggleShelf={handleShelfChange} onDeleteModelPermanent={handleDeleteModelPermanent}
      />

      {/* 新增密钥弹窗 */}
      <AddKeyDialog
        open={addKeyModal.open} onOpenChange={(open) => setAddKeyModal({ ...addKeyModal, open })}
        providerId={addKeyModal.providerId}
        onSuccess={(newKeyId) => {
          const newModels = bundle?.models.filter((m) => m.key_id === newKeyId) ?? [];
          triggerHighlight(newModels.map((m) => m.model_id));
        }}
      />

      {/* 服务商管理大弹窗 */}
      <ProvidersManagerDialog
        open={providersManagerOpen} onOpenChange={setProvidersManagerOpen}
        onEditProvider={(provider) => setProviderModal({ open: true, data: provider })}
        onCreateProvider={() => setProviderModal({ open: true, data: null })}
      />

      {/* 编辑/新建服务商表单弹窗 */}
      <ProviderDialog
        open={providerModal.open}
        provider={providerModal.data}
        onOpenChange={(open) => setProviderModal({ ...providerModal, open })}
        onSave={async (data) => {
          await mutateEntity(providerModal.data?.id ? "update" : "create", "provider", data);
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
