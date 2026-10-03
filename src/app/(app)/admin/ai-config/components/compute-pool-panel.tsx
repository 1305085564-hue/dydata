"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  Server,
  Plus,
  Zap,
  Activity,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  useAiConfig,
  type AiProvider,
  type AiProviderKey,
  type AiProviderKeyModel,
} from "../hooks/use-ai-config";
import { ModelFamilyCard, type ModelFamilyKeyItem } from "./model-family-card";
import { AddKeyDialog } from "./add-key-dialog";
import { ProviderDialog, KeyDialog } from "./providers-dialogs";
import { SyncModelsDialog } from "./sync-models-dialog";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName } from "@/lib/ai/model-families";

export function ComputePoolPanel() {
  const {
    bundle,
    isLoading,
    mutateEntity,
    swapKeyPriority,
    testKeyConnection,
    checkDependencies,
    syncKeyModels,
    setKeyModelSelection,
  } = useAiConfig();

  // 待删除密钥集合与定时器
  const [pendingDeletion, setPendingDeletion] = useState<Set<string>>(new Set());
  const deletionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map()); // gate:transient-map 撤回定时器句柄集合，随组件卸载释放

  // 高亮模型卡片
  const [highlightedModels, setHighlightedModels] = useState<string[]>([]);

  // 弹窗状态
  const [addKeyModal, setAddKeyModal] = useState<{
    open: boolean;
    providerId: string | null;
  }>({
    open: false,
    providerId: null,
  });

  const [providerModal, setProviderModal] = useState<{
    open: boolean;
    data: Partial<AiProvider> | null;
  }>({
    open: false,
    data: null,
  });

  const [editKeyModal, setEditKeyModal] = useState<{
    open: boolean;
    data: Partial<AiProviderKey> | null;
  }>({
    open: false,
    data: null,
  });

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

  // 组件卸载时清理所有删除计时器
  useEffect(() => {
    const timers = deletionTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // 算力概览指标
  const stats = useMemo(() => {
    if (!bundle) {
      return { totalProviders: 0, activeKeys: 0, totalKeys: 0, healthRate: 100 };
    }
    const totalProviders = bundle.providers.filter((p) => p.is_enabled).length;
    const activeKeys = bundle.keys.filter((k) => k.is_enabled).length;
    const totalKeys = bundle.keys.length;
    const healthyKeys = bundle.keys.filter(
      (k) => k.is_enabled && k.consecutive_failures === 0
    ).length;
    const healthRate = activeKeys > 0 ? Math.round((healthyKeys / activeKeys) * 100) : 100;
    return {
      totalProviders,
      activeKeys,
      totalKeys,
      healthRate,
    };
  }, [bundle]);

  // 按模型聚合的密钥列表
  const modelFamilyGroups = useMemo(() => {
    if (!bundle) return [];

    const providerMap = new Map(bundle.providers.map((p) => [p.id, p])); // gate:transient-map useMemo计算内部查找索引，随渲染释放
    const keyMap = new Map(bundle.keys.map((k) => [k.id, k])); // gate:transient-map useMemo计算内部查找索引，随渲染释放

    // modelId -> items
    const groups = new Map<string, { modelId: string; displayName: string; items: ModelFamilyKeyItem[] }>(); // gate:transient-map useMemo计算内部模型聚合，随渲染释放

    for (const m of bundle.models) {
      const key = keyMap.get(m.key_id);
      if (!key) continue;
      const provider = providerMap.get(key.provider_id);
      if (!provider) continue;

      const modelId = m.model_id;
      const displayName = m.display_name || getModelDisplayName(modelId);

      if (!groups.has(modelId)) {
        groups.set(modelId, {
          modelId,
          displayName,
          items: [],
        });
      }

      groups.get(modelId)!.items.push({
        key,
        providerName: provider.name,
        modelRecordId: m.id,
        modelId,
        displayName,
      });
    }

    // 对每个组内按 key.priority 排序
    for (const group of groups.values()) {
      group.items.sort((a, b) => a.key.priority - b.key.priority);
    }

    return Array.from(groups.values());
  }, [bundle]);

  // 任务 3.1: 5 秒撤回执行
  const startPendingDelete = (keyId: string) => {
    setPendingDeletion((prev) => new Set(prev).add(keyId));

    const toastId = feedbackToast.warning("已删除密钥，5 秒内可撤回", {
      duration: 5000,
      action: {
        label: "撤回",
        onClick: () => handleUndoDelete(keyId, toastId),
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

  const handleUndoDelete = (keyId: string, toastId?: string | number) => {
    const timer = deletionTimers.current.get(keyId);
    if (timer) clearTimeout(timer);
    deletionTimers.current.delete(keyId);

    setPendingDeletion((prev) => {
      const next = new Set(prev);
      next.delete(keyId);
      return next;
    });

    if (toastId) {
      // dismiss
    }
    feedbackToast.success("已撤回删除");
  };

  // 任务 3.2: 删除前依赖检查
  const handleDeleteWithCheck = async (keyId: string) => {
    const deps = await checkDependencies(keyId);

    // 如果依赖且无备用模型，阻止删除
    if (deps.criticalBindings.length > 0) {
      const names = deps.criticalBindings.map((b) => b.label).join("、");
      feedbackToast.error(`此密钥正在被【${names}】使用，且无可用备用模型，禁止删除`, {
        action: {
          label: "知道了",
          onClick: () => {},
        },
      });
      return;
    }

    // 如果有依赖但有备用，给出提示允许确认
    if (deps.affectedBindings.length > 0) {
      feedbackToast.warning(
        `此密钥正在被 ${deps.affectedBindings.length} 个功能使用，删除后将自动切换到备用模型`,
        {
          action: {
            label: "继续删除",
            onClick: () => startPendingDelete(keyId),
          },
        }
      );
      return;
    }

    // 无依赖，直接进入 5 秒撤回流程
    startPendingDelete(keyId);
  };

  // 任务 3.3: 模型同步或新建后的高亮与定位
  const triggerHighlight = (modelIds: string[]) => {
    if (modelIds.length === 0) return;
    setHighlightedModels(modelIds);
    setTimeout(() => {
      const firstId = modelIds[0];
      const el = document.querySelector(`[data-model-id="${firstId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setHighlightedModels([]), 3000);
  };

  const handleSwapPriority = async (
    keyId: string,
    targetKeyId: string,
    p1: number,
    p2: number
  ) => {
    await swapKeyPriority(keyId, targetKeyId, p1, p2);
  };

  return (
    <div className="space-y-4">
      {/* 算力概览条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E2DF] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-[13px] text-[#1F1E1D]">
          <div>
            <span className="text-[#78716C] mr-1.5">服务商</span>
            <span className="font-medium text-[#141413]">{stats.totalProviders} 家</span>
          </div>
          <span className="text-[#E2E2DF]">|</span>
          <div>
            <span className="text-[#78716C] mr-1.5">活跃密钥</span>
            <span className="font-medium text-[#141413]">{stats.activeKeys} 个</span>
          </div>
          <span className="text-[#E2E2DF]">|</span>
          <div>
            <span className="text-[#78716C] mr-1.5">健康率</span>
            <span className="font-medium text-[#10B981]">{stats.healthRate}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="s"
            className="h-8 px-2.5 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
            onClick={() => setProviderModal({ open: true, data: null })}
          >
            <Server className="size-3.5 mr-1 text-[#78716C]" />
            管理服务商
          </Button>
          <Button
            size="s"
            className="h-8 px-3 text-[12px] gap-1 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal"
            onClick={() => setAddKeyModal({ open: true, providerId: null })}
          >
            <Plus className="size-3.5" />
            接入新渠道
          </Button>
        </div>
      </div>

      {/* 按模型聚合的算力列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[13px] font-medium text-[#1F1E1D]">
            按模型聚合的可用算力池
          </span>
          <span className="text-[12px] text-[#78716C]">
            共 {modelFamilyGroups.length} 个模型分类 · 自动根据顺位进行同模型跨渠道调度
          </span>
        </div>

        {modelFamilyGroups.length === 0 ? (
          <div className="rounded-xl border border-[#E2E2DF] bg-white p-12 text-center text-[13px] text-[#78716C]">
            算力池暂无接入模型，点击上方「接入新渠道」开启配置。
          </div>
        ) : (
          modelFamilyGroups.map((group) => (
            <ModelFamilyCard
              key={group.modelId}
              modelId={group.modelId}
              displayName={group.displayName}
              items={group.items}
              highlightedModelIds={highlightedModels}
              pendingDeletionKeys={pendingDeletion}
              onTestKey={async (keyId, mId) => {
                await testKeyConnection(keyId, mId);
              }}
              onEditKey={(key) => setEditKeyModal({ open: true, data: key })}
              onDeleteKeyWithCheck={handleDeleteWithCheck}
              onUndoDeleteKey={handleUndoDelete}
              onAddChannelForModel={(mId) => {
                setAddKeyModal({ open: true, providerId: null });
              }}
              onSwapPriority={handleSwapPriority}
            />
          ))
        )}
      </div>

      {/* 新增密钥弹窗 */}
      <AddKeyDialog
        open={addKeyModal.open}
        onOpenChange={(open) => setAddKeyModal({ ...addKeyModal, open })}
        providerId={addKeyModal.providerId}
        onSuccess={(newKeyId) => {
          // 查找该 key 关联的模型并高亮
          const newModels = bundle?.models.filter((m) => m.key_id === newKeyId) ?? [];
          triggerHighlight(newModels.map((m) => m.model_id));
        }}
      />

      {/* 服务商管理弹窗 */}
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
          if (ok) {
            triggerHighlight(mIds);
          }
          return ok;
        }}
      />
    </div>
  );
}
