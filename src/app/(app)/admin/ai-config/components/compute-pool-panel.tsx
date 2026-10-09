"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Plus, RotateCcw, Loader2, Activity, X } from "lucide-react";
import {
  useAiConfig,
  type AiProvider,
  type AiProviderKey,
  type SyncModelReconciliation,
  AI_MODEL_BATCH_TIMEOUT_MESSAGE,
} from "../hooks/use-ai-config";
import { ModelFamilyCard } from "./model-family-card";
import { AddKeyDialog } from "./add-key-dialog";
import { ProviderQuickActionsDialog, ProvidersManagerDialog } from "./providers-dialogs";
import { DangerousActionDialog, type DangerousActionType } from "./dangerous-action-dialog";
import { SyncModelsDialog, type ChannelTestSummary } from "./sync-models-dialog";
import { ModelManagerDialog } from "./model-manager-dialog";
import { useSearchParams } from "next/navigation";
import { PoolViewSwitcher, type PoolViewMode } from "./pool-view-switcher";
import { ChannelPoolView } from "./channel-pool-view";
import {
  KeyTestResultsBar,
  SyncFailedResultsBar,
  type WarehouseModelGroup,
  type KeyTestResultItem,
} from "./shelf-models-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName, resolveModelDisplayName } from "@/lib/ai/model-families";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { presentError } from "@/lib/ai-config/presentation";

export function ComputePoolPanel() {
  const {
    bundle,
    mutate,
    mutateEntity,
    swapKeyPriority,
    testKeyModel,
    testKeyAllModels,
    testAllKeysAllModels,
    checkDependencies,
    setKeyModelSelection,
    syncKeyModels,
    removeKeyModel,
    refresh,
  } = useAiConfig();

  const [channelReconciliations, setChannelReconciliations] = useState<Map<string, SyncModelReconciliation>>(new Map());
  const [pendingDeletion] = useState<Set<string>>(new Set());
  // gate:transient-map 渠道撤回定时器集合，随组件卸载释放
  const deletionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // gate:transient-map 撤回倒计时截止时间，随组件卸载释放
  const deletionDeadlines = useRef<Map<string, number>>(new Map());
  const [deletionNow, setDeletionNow] = useState(() => Date.now());
  const [highlightedModels, setHighlightedModels] = useState<string[]>([]);
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [providersManagerOpen, setProvidersManagerOpen] = useState(false);
  const [addKeyModal, setAddKeyModal] = useState<{ open: boolean; providerId: string | null }>({ open: false, providerId: null });
  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({ open: false, data: null });
  const [panelDangerousAction, setPanelDangerousAction] = useState<{
    open: boolean;
    actionType: DangerousActionType;
    targetId: string;
    targetName: string;
    loading: boolean;
    isExecuting: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preview: any;
    onExecute?: () => Promise<void>;
    onNarrower?: () => Promise<void>;
    narrowerLabel?: string;
    narrowerDesc?: string;
    confirmLabel?: string;
  }>({
    open: false,
    actionType: "delete_key",
    targetId: "",
    targetName: "",
    loading: false,
    isExecuting: false,
    preview: null,
  });
  const searchParams = useSearchParams();
  const urlView = searchParams.get("view");
  const [viewMode, setViewMode] = useState<PoolViewMode>(
    urlView === "channel" ? "channel" : "model"
  );

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "channel" || v === "model") {
      setViewMode(v);
    }
  }, [searchParams]);

  const handleViewModeChange = (nextMode: PoolViewMode) => {
    setViewMode(nextMode);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", nextMode);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const [syncDialog, setSyncDialog] = useState<{
    open: boolean;
    keyId: string | null;
    keyLabel: string;
  }>({
    open: false,
    keyId: null,
    keyLabel: "",
  });

  const [syncingAll, setSyncingAll] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [confirmTestAllOpen, setConfirmTestAllOpen] = useState(false);
  const [testingAllModels, setTestingAllModels] = useState(false);
  const [modelTestingState, setModelTestingState] = useState<{ total: number } | null>(null);
  const [testResults, setTestResults] = useState<{ total: number; results: KeyTestResultItem[] } | null>(null);
  const [channelTestSummaries, setChannelTestSummaries] = useState<Map<string, ChannelTestSummary>>(new Map());
  const [syncFailedChannels, setSyncFailedChannels] = useState<Array<{ keyName: string; error: string }> | null>(null);
  const [allModelsTestFailures, setAllModelsTestFailures] = useState<{
    totalKeys: number;
    totalModels: number;
    successCount: number;
    failureCount: number;
    failures: Array<{
      keyId: string;
      keyLabel: string;
      modelId: string;
      error: string;
    }>;
  } | null>(null);

  useEffect(() => { if (!pendingDeletion.size) return; const interval = window.setInterval(() => setDeletionNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [pendingDeletion.size]);

  useEffect(() => { const kTimers = deletionTimers.current; const deadlines = deletionDeadlines.current; return () => { kTimers.forEach((t) => clearTimeout(t)); deadlines.clear(); }; }, []);

  const modelFamilyGroups = useMemo(() => {
    if (!bundle) return [];
    const providerMap = new Map(bundle.providers.map((p) => [p.id, p])); // gate:transient-map useMemo内部查找索引，随渲染释放
    const keyMap = new Map(bundle.keys.map((k) => [k.id, k])); // gate:transient-map useMemo内部查找索引，随渲染释放
    const groups = new Map<string, WarehouseModelGroup>(); // gate:transient-map useMemo内部模型索引，随渲染释放

    for (const m of bundle.models) {
      const key = keyMap.get(m.key_id);
      if (!key) continue;
      const provider = providerMap.get(key.provider_id);
      if (!provider) continue;

      const modelId = m.model_id;
      const displayName = resolveModelDisplayName(m.display_name, modelId);
      const globalEnabled = m.global_is_enabled === undefined ? m.is_enabled : m.global_is_enabled === true;

      if (!groups.has(modelId)) {
        groups.set(modelId, { modelId, displayName, items: [], isShelved: globalEnabled });
      } else if (globalEnabled) {
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

  // gate:transient-map 撤回倒计时展示索引，仅随待删除状态短暂存在
  const pendingDeletionRemaining = useMemo(() => new Map(Array.from(pendingDeletion).map((keyId) => [keyId, Math.max(0, Math.ceil(((deletionDeadlines.current.get(keyId) ?? deletionNow) - deletionNow) / 1000))] as [string, number])), [pendingDeletion, deletionNow]);

  const handleRenameModel = async (modelId: string, modelRecordId: string, newDisplayName: string) => {
    const res = await mutateEntity("update", "model", { id: modelRecordId, display_name: newDisplayName });
    return res.ok;
  };

  const handleDeleteModelPermanent = async (group: WarehouseModelGroup) => {
    setPanelDangerousAction({
      open: true,
      actionType: "unmount_model",
      targetId: group.modelId,
      targetName: group.displayName,
      loading: true,
      isExecuting: false,
      preview: null,
      narrowerLabel: "保持为储备状态（无需删除）",
      narrowerDesc: "如果后续可能还会使用，建议仅取消勾选保持为储备状态，无需彻底清除记录：",
      confirmLabel: "确认收走模型供应",
      onNarrower: async () => {
        setPanelDangerousAction((prev) => ({ ...prev, open: false }));
        setModelManagerOpen(true);
      },
      onExecute: async () => {
        const results = await Promise.all(group.items.map((item) => mutateEntity("delete", "model", { id: item.modelRecordId })));
        const okCount = results.filter((result) => result.ok).length;
        const failed = group.items.filter((_, index) => !results[index]?.ok).map((item) => item.displayName);
        await refresh();
        if (okCount === results.length) {
          feedbackToast.success(`已收走 ${okCount} 条模型供给记录`);
        } else {
          feedbackToast.error(`已收走 ${okCount} 条，${results.length - okCount} 条失败：${failed.join("、")}`);
        }
        setPanelDangerousAction((prev) => ({ ...prev, open: false }));
      },
    });

    try {
      const deps = await checkDependencies({ scope: "model", id: group.modelId });
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: deps,
      }));
    } catch {
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: {
          ok: false,
          complete: false,
          unknownReasons: ["无法连接依赖检查接口"],
          criticalBindings: [],
          affectedBindings: [],
        },
      }));
    }
  };

  const handleSyncAll = async () => {
    if (syncingAll || testingAll) return;
    setSyncingAll(true);
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

      const totalModels = freshBundle?.models?.length ?? bundle?.models?.length;
      const stockPart = totalModels !== undefined ? `，池内共 ${totalModels} 个模型` : "";

      if (failedList.length > 0) {
        feedbackToast.warning(
          `已测试 ${data.total} 个渠道${stockPart}，${failedList.length} 个渠道探测失败`,
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
        feedbackToast.success(`全池 ${data.total} 个渠道同步完成${stockPart}`);
      }
    } catch (err) {
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "全部同步模型失败"));
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
  const executeShelfChange = async (modelId: string, nextState: boolean) => {
    try {
      const res = await fetchWithTimeout("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_global_model_shelf_state", data: { modelId, is_enabled: nextState } }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || (res.status === 409 ? "独占使用中，禁止下架" : "操作失败") };
      mutate(data);
      return { ok: true };
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "网络异常" }; }
  };

  const handleShelfChange = async (modelId: string, nextState: boolean) => {
    if (nextState) {
      const res = await executeShelfChange(modelId, true);
      if (res.ok) feedbackToast.success("已全站上架模型");
      return res;
    }

    const group = modelFamilyGroups.find((g) => g.modelId === modelId);
    const displayName = group?.displayName || modelId;

    setPanelDangerousAction({
      open: true,
      actionType: "unshelf_model",
      targetId: modelId,
      targetName: displayName,
      loading: true,
      isExecuting: false,
      preview: null,
      narrowerLabel: "前往渠道视角管理单条渠道",
      narrowerDesc: "如果只想在某条特定渠道上停用该模型，建议前往渠道视角单独关闭，无需全站下架：",
      confirmLabel: "确认全站下架",
      onNarrower: async () => {
        setPanelDangerousAction((prev) => ({ ...prev, open: false }));
        handleViewModeChange("channel");
        feedbackToast.success("已切换至渠道视角，可在右侧单独管理各渠道的模型挂载");
      },
      onExecute: async () => {
        const res = await executeShelfChange(modelId, false);
        if (res.ok) {
          feedbackToast.success(`已全站下架模型「${displayName}」`);
          setPanelDangerousAction((prev) => ({ ...prev, open: false }));
        } else {
          feedbackToast.error(res.error || "全站下架失败");
        }
      },
    });

    try {
      const deps = await checkDependencies({ scope: "model", id: modelId });
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: deps,
      }));
    } catch {
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: {
          ok: false,
          complete: false,
          unknownReasons: ["无法连接依赖检查接口"],
          criticalBindings: [],
          affectedBindings: [],
        },
      }));
    }
    return { ok: true };
  };

  const handleSyncKeyModels = async (key: AiProviderKey) => {
    setSyncDialog({
      open: true,
      keyId: key.id,
      keyLabel: key.label,
    });
  };

  const handleDeleteWithCheck = async (keyId: string) => {
    const key = bundle?.keys.find((k) => k.id === keyId);
    const keyLabel = key?.label || "未命名渠道";

    setPanelDangerousAction({
      open: true,
      actionType: "delete_key",
      targetId: keyId,
      targetName: keyLabel,
      loading: true,
      isExecuting: false,
      preview: null,
      narrowerLabel: "仅停用此渠道（保留配置）",
      narrowerDesc: "如果只是临时停用该线路，建议「仅停用此渠道」，配置与模型挂载均会保留：",
      confirmLabel: "确认彻底删除渠道",
      onNarrower: async () => {
        const res = await mutateEntity("update", "key", { id: keyId, is_enabled: false });
        if (res.ok) {
          feedbackToast.success(`已停用渠道「${keyLabel}」`);
          setPanelDangerousAction((prev) => ({ ...prev, open: false }));
        }
      },
      onExecute: async () => {
        const res = await mutateEntity("delete", "key", { id: keyId });
        if (res.ok) {
          feedbackToast.success(`已彻底删除渠道「${keyLabel}」`);
          setPanelDangerousAction((prev) => ({ ...prev, open: false }));
        } else {
          feedbackToast.error("删除渠道失败");
        }
      },
    });

    try {
      const deps = await checkDependencies({ scope: "key", id: keyId });
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: deps,
      }));
    } catch {
      setPanelDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: {
          ok: false,
          complete: false,
          unknownReasons: ["无法连接依赖检查接口"],
          criticalBindings: [],
          affectedBindings: [],
        },
      }));
    }
  };

  const handleRenameKey = async (keyId: string, newLabel: string) => {
    const res = await mutateEntity("update", "key", { id: keyId, label: newLabel });
    return res.ok;
  };

  const handleToggleKeyEnable = async (keyId: string, enabled: boolean) => {
    const res = await mutateEntity("update", "key", { id: keyId, is_enabled: enabled });
    return res.ok;
  };

  const handleTestKeyAllModels = async (keyId: string) => {
    const total = bundle?.models.filter((model) => model.key_id === keyId).length ?? 0;
    setModelTestingState({ total });
    try {
      const data = await testKeyAllModels(keyId);
      const key = bundle?.keys.find((k) => k.id === keyId);
      const rawResults = data?.results ?? [];
      const mappedResults: KeyTestResultItem[] = rawResults.map((r) => ({
        keyId: `${keyId}-${r.modelId}`,
        keyName: key?.label || "渠道",
        modelId: r.modelId,
        ok: r.ok,
        latencyMs: r.latencyMs ?? null,
        error: r.error ?? undefined,
      }));
      const results = rawResults.map((r) => ({
        modelId: r.modelId,
        ok: r.ok,
        latencyMs: r.latencyMs ?? null,
        error: r.error ?? null,
      }));
      const failures = results.filter((r) => !r.ok);
      const channelSummary: ChannelTestSummary = {
        total: data?.total ?? mappedResults.length,
        successCount: data?.successCount ?? mappedResults.filter((r) => r.ok).length,
        failureCount: data?.failureCount ?? failures.length,
        results,
      };
      setChannelTestSummaries((prev) => {
        const next = new Map(prev);
        next.set(keyId, channelSummary);
        return next;
      });
      setTestResults({ total: mappedResults.length, results: mappedResults });
      const successCount = mappedResults.filter((r) => r.ok).length;
      if (mappedResults.length > 0 && successCount === mappedResults.length) {
        feedbackToast.success(`渠道模型检测全部通过（${successCount}/${mappedResults.length}）`);
      } else if (mappedResults.length === 0) {
        feedbackToast.warning("该渠道没有可检测的上架模型，未形成通过结论");
      } else {
        feedbackToast.warning(`检测完成：${successCount} 个通过，${mappedResults.length - successCount} 个未通过`);
      }
    } catch (err) {
      if (err instanceof Error && err.message === AI_MODEL_BATCH_TIMEOUT_MESSAGE) {
        feedbackToast.error(AI_MODEL_BATCH_TIMEOUT_MESSAGE, {
          description: "检测已中断，可以继续检测。",
          action: {
            label: "继续检测",
            onClick: () => {
              void handleTestKeyAllModels(keyId);
            },
          },
        });
      } else {
        feedbackToast.error(err instanceof Error ? err.message : "渠道全模型检测异常");
      }
    } finally {
      setModelTestingState(null);
    }
  };

  const handleRunTestAllKeysAllModels = async () => {
    setTestingAllModels(true);
    setAllModelsTestFailures(null);
    setModelTestingState({ total: bundle?.models.length ?? 0 });
    try {
      const data = (await testAllKeysAllModels()) as {
        totalKeys?: number;
        totalModels?: number;
        successCount?: number;
        failureCount?: number;
        failures?: Array<{
          keyId: string;
          keyLabel: string;
          modelId: string;
          error: string;
        }>;
      } | null;
      if (!data) return;

      const totalKeys = data.totalKeys ?? 0;
      const totalModels = data.totalModels ?? 0;
      const successCount = data.successCount ?? 0;
      const failureCount = data.failureCount ?? 0;
      const failures = data.failures ?? [];

      setAllModelsTestFailures({
        totalKeys,
        totalModels,
        successCount,
        failureCount,
        failures,
      });
      if (totalModels === 0) {
        feedbackToast.warning("全池没有可检测的上架模型，未形成通过结论");
      } else if (failureCount > 0) {
        feedbackToast.warning(
          `全池检测完成：测了 ${totalModels} 个模型，${successCount} 个通过，${failureCount} 个失败`
        );
      } else {
        feedbackToast.success(
          `全部渠道模型检测通过（测了 ${totalModels} 个模型，覆盖 ${totalKeys} 个渠道，全部正常）`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message === AI_MODEL_BATCH_TIMEOUT_MESSAGE) {
        feedbackToast.error(AI_MODEL_BATCH_TIMEOUT_MESSAGE, {
          description: "检测已中断，可以继续检测。",
          action: {
            label: "继续检测",
            onClick: () => {
              void handleRunTestAllKeysAllModels();
            },
          },
        });
      } else {
        feedbackToast.error(err instanceof Error ? err.message : "检测异常");
      }
    } finally {
      setModelTestingState(null);
      setTestingAllModels(false);
      setConfirmTestAllOpen(false);
    }
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
    <div className="space-y-3">
      {/* 1. 外围工具栏：彻底脱壳裸铺，左侧为主导航视角切换，右侧为极简动作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
        {/* 左侧：统领全局的视角切换（纯粹导航） */}
        <div className="flex items-center">
          <PoolViewSwitcher viewMode={viewMode} onChange={handleViewModeChange} />
        </div>

        {/* 右侧：操作按钮组（固定四按钮，符合规范与 tooltip 一句话） */}
        <TooltipProvider delay={100}>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="s"
                    aria-label="全部同步模型"
                    className="h-7 px-2.5 border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0 cursor-pointer gap-1.5 text-[12px]"
                    disabled={syncingAll || testingAll || testingAllModels}
                    onClick={handleSyncAll}
                  >
                    {syncingAll ? (
                      <Loader2 className="size-3.5 animate-spin text-[#78716C]" />
                    ) : (
                      <RotateCcw className="size-3.5 text-[#78716C]" />
                    )}
                    <span>全部同步模型</span>
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-[12px]">
                拉取所有渠道的模型清单
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="s"
                    aria-label="巡检全部渠道"
                    className="h-7 px-2.5 border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0 cursor-pointer gap-1.5 text-[12px]"
                    disabled={syncingAll || testingAll || testingAllModels}
                    onClick={handleTestAll}
                  >
                    {testingAll ? (
                      <Loader2 className="size-3.5 animate-spin text-[#78716C]" />
                    ) : (
                      <Activity className="size-3.5 text-[#78716C]" />
                    )}
                    <span>巡检全部渠道</span>
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-[12px]">
                每渠道抽测一条，快速看在线
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="s"
                    aria-label="全部模型检测"
                    className="h-7 px-2.5 border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] shrink-0 cursor-pointer gap-1.5 text-[12px]"
                    disabled={syncingAll || testingAll || testingAllModels}
                    onClick={() => setConfirmTestAllOpen(true)}
                  >
                    {testingAllModels ? (
                      <Loader2 className="size-3.5 animate-spin text-[#78716C]" />
                    ) : (
                      <Activity className="size-3.5 text-[#78716C]" />
                    )}
                    <span>全部模型检测</span>
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-[12px]">
                全部渠道全部模型，最彻底
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="s"
                    aria-label="接入渠道"
                    className="h-7 px-3 text-[12px] gap-1 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input shrink-0"
                    onClick={() => setAddKeyModal({ open: true, providerId: null })}
                  >
                    <Plus className="size-3.5" />
                    <span>接入渠道</span>
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-[12px]">
                接入一条新的渠道
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {modelTestingState && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#E2E2DF] bg-[#FAF9F8] px-3.5 py-2.5 text-[12px] text-[#78716C] shadow-input"
        >
          <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
          <span className="text-[#141413] font-medium">
            正在检测 {modelTestingState.total} 个模型…
          </span>
        </div>
      )}

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

      {/* 全部模型检测结果条 */}
      {allModelsTestFailures && (
        <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-3.5 shadow-card space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-[#C0685C]">
              <span className="font-medium">
                {allModelsTestFailures.failureCount > 0 ? "全池模型深度检测异常" : "全池模型深度检测结果"}
              </span>
              <span className="text-[12px]">
                (测了 {allModelsTestFailures.totalModels} 个模型 · 通过 {allModelsTestFailures.successCount} 个 · 失败 {allModelsTestFailures.failureCount} 个)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAllModelsTestFailures(null)}
              className="text-[#C0685C] hover:bg-[#C0685C]/10 p-1 rounded-md cursor-pointer"
              title="关闭明细"
              aria-label="关闭明细"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {allModelsTestFailures.failures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {allModelsTestFailures.failures.map((f, idx) => (
              <div
                key={`${f.keyId}-${f.modelId}-${idx}`}
                className="flex flex-col gap-1 rounded-lg border border-[#C0685C]/20 bg-white px-2.5 py-2 text-[12px]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[#141413] font-medium truncate" title={f.keyLabel}>
                    {f.keyLabel}
                  </span>
                  <span className="text-[12px] px-1.5 py-0.2 rounded bg-[#C0685C]/10 text-[#C0685C] shrink-0 font-normal">
                    失败
                  </span>
                </div>
                <div className="text-[12px] font-mono text-[#78716C] truncate">
                  {getModelDisplayName(f.modelId)}
                </div>
                <div className="text-[12px] text-[#C0685C] line-clamp-2" title={f.error}>
                  {f.error && f.error.trim() ? f.error.trim() : "未返回原因"}
                </div>
              </div>
              ))}
            </div>
          ) : allModelsTestFailures.totalModels > 0 ? (
            <div className="text-[12px] text-[#6FAA7D]">全部模型检测通过</div>
          ) : (
            <div className="text-[12px] text-[#A16207]">没有可检测的上架模型，未形成通过结论</div>
          )}
        </div>
      )}

      {viewMode === "model" ? (
        <div className="space-y-3">
          {activeGroups.length === 0 ? (
            <EmptyState
              className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
              title="暂无现役在册模型"
              description="接入渠道后，同步模型并在模型下查看可用渠道。"
              action={{ label: "接入渠道", onClick: () => setAddKeyModal({ open: true, providerId: null }) }}
            />
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
                  pendingDeletionRemaining={pendingDeletionRemaining}
                  isShelved={group.isShelved}
                  onRenameModel={handleRenameModel}
                  onRenameKey={handleRenameKey}
                  onToggleModelShelf={handleShelfChange}
                  onToggleKeyEnable={handleToggleKeyEnable}
                  onTestKey={testKeyModel}
                  onSyncKeyModels={handleSyncKeyModels}
                  onDeleteKeyWithCheck={handleDeleteWithCheck}
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
          channelReconciliations={channelReconciliations}
          onSyncKeyModels={handleSyncKeyModels}
          onTestKeyModel={testKeyModel}
          onTestKeyAllModels={handleTestKeyAllModels}
          onToggleKeyEnable={handleToggleKeyEnable}
          onRenameKey={handleRenameKey}
          onDeleteKeyWithCheck={handleDeleteWithCheck}
          onOpenManageProviders={() => setProvidersManagerOpen(true)}
          onOpenAddKey={() => setAddKeyModal({ open: true, providerId: null })}
          onToggleModelEnable={async (modelRecordId, enabled) => {
            const res = await mutateEntity("update", "model", { id: modelRecordId, is_enabled: enabled });
            return res.ok;
          }}
          onUpdateKeyPriority={async (keyId, priority) => {
            const res = await mutateEntity("update", "key", { id: keyId, priority });
            return res.ok;
          }}
          onUpdateKeyApiKey={async (keyId, apiKey) => {
            const res = await mutateEntity("update", "key", { id: keyId, api_key: apiKey });
            return res.ok;
          }}
          onUpdateKeyProvider={async (keyId, providerId) => {
            const res = await mutateEntity("update", "key", { id: keyId, provider_id: providerId });
            return res.ok;
          }}
          onUpdateProviderBaseUrl={async (providerId, baseUrl) => {
            const res = await mutateEntity("update", "provider", { id: providerId, base_url: baseUrl });
            return res.ok;
          }}
        />
      )}

      <ModelManagerDialog
        open={modelManagerOpen}
        onOpenChange={setModelManagerOpen}
        allGroups={modelFamilyGroups}
        providers={bundle?.providers ?? []}
        onToggleShelf={handleShelfChange}
        onDeleteModelPermanent={handleDeleteModelPermanent}
      />

      <ProvidersManagerDialog
        open={providersManagerOpen}
        onOpenChange={setProvidersManagerOpen}
        onEditProvider={(provider) => setProviderModal({ open: true, data: provider })}
        onCreateProvider={() => setProviderModal({ open: true, data: null })}
      />

      {/* 新增渠道弹窗 */}
      <AddKeyDialog
        open={addKeyModal.open} onOpenChange={(open) => setAddKeyModal({ ...addKeyModal, open })}
        providerId={addKeyModal.providerId}
        onSuccess={(newKeyId) => {
          const newModels = bundle?.models.filter((m) => m.key_id === newKeyId) ?? [];
          triggerHighlight(newModels.map((m) => m.model_id));
        }}
      />

      {/* 编辑/新建接入点表单弹窗 */}
      <ProviderQuickActionsDialog
        open={providerModal.open}
        provider={providerModal.data}
        onOpenChange={(open) => setProviderModal({ ...providerModal, open })}
        onSave={async (data) => {
          await mutateEntity(providerModal.data?.id ? "update" : "create", "provider", data);
          setProviderModal({ open: false, data: null });
        }}
      />

      {/* 自定义模型勾选弹窗 */}
      <SyncModelsDialog
        open={syncDialog.open}
        keyId={syncDialog.keyId}
        keyLabel={syncDialog.keyLabel}
        onOpenChange={(open) => setSyncDialog((prev) => ({ ...prev, open }))}
        onSync={syncKeyModels}
        onTestKeyAllModels={testKeyAllModels}
        onRemoveModel={removeKeyModel}
        lastTestSummary={syncDialog.keyId ? channelTestSummaries.get(syncDialog.keyId) ?? null : null}
        onTestSummaryChange={(kId, summary) => {
          setChannelTestSummaries((prev) => {
            const next = new Map(prev);
            next.set(kId, summary);
            return next;
          });
        }}
        lastReconciliation={syncDialog.keyId ? channelReconciliations.get(syncDialog.keyId) ?? null : null}
        onReconciliationChange={(kId, rec) => {
          setChannelReconciliations((prev) => {
            const next = new Map(prev);
            if (rec) next.set(kId, rec);
            else next.delete(kId);
            return next;
          });
        }}
        onSave={async (kId, mIds) => {
          const ok = await setKeyModelSelection(kId, mIds);
          if (ok) triggerHighlight(mIds);
          return ok;
        }}
      />

      {/* 全部渠道全模型检测二次确认弹窗 */}
      <ConfirmDialog
        open={confirmTestAllOpen}
        onOpenChange={setConfirmTestAllOpen}
        title="检测全部渠道模型"
        description="系统将限流并行测试全池所有渠道挂载的模型连通性。该操作可能耗时较长，测试结果将在正下方呈现。确定继续吗？"
        confirmText="开始全池检测"
        cancelText="取消"
        loading={testingAllModels}
        onConfirm={handleRunTestAllKeysAllModels}
      />

      {/* 危险动作执行前确认闸门（B-2） */}
      <DangerousActionDialog
        open={panelDangerousAction.open}
        onOpenChange={(op) => setPanelDangerousAction((prev) => ({ ...prev, open: op }))}
        actionType={panelDangerousAction.actionType}
        targetName={panelDangerousAction.targetName}
        loading={panelDangerousAction.loading}
        preview={panelDangerousAction.preview}
        onConfirm={async () => {
          if (panelDangerousAction.onExecute) {
            setPanelDangerousAction((prev) => ({ ...prev, isExecuting: true }));
            try {
              await panelDangerousAction.onExecute();
            } finally {
              setPanelDangerousAction((prev) => ({ ...prev, isExecuting: false }));
            }
          }
        }}
        onNarrowerAction={panelDangerousAction.onNarrower}
        narrowerActionLabel={panelDangerousAction.narrowerLabel}
        narrowerActionDescription={panelDangerousAction.narrowerDesc}
        confirmButtonLabel={panelDangerousAction.confirmLabel}
        isExecuting={panelDangerousAction.isExecuting}
      />
    </div>
  );
}
