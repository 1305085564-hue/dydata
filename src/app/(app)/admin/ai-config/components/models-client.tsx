"use client";

import { useMemo, useState } from "react";
import { AiProviderKeyModel, useAiConfig, AiConfigBundle } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, Plus, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, Tag, GripVertical } from "lucide-react";
import { ModelDialog, KeyDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

// 智能模型系列映射
function getModelFamily(modelId: string): { familyId: string; familyName: string } {
  const id = modelId.toLowerCase();
  if (id.includes("claude")) return { familyId: "claude", familyName: "Claude 模型系列" };
  if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("openai")) {
    return { familyId: "openai", familyName: "OpenAI / ChatGPT 系列" };
  }
  if (id.includes("deepseek")) return { familyId: "deepseek", familyName: "DeepSeek 系列" };
  if (id.includes("gemini")) return { familyId: "gemini", familyName: "Gemini 系列" };
  if (id.includes("qwen") || id.includes("tongyi")) return { familyId: "qwen", familyName: "通义千问 (Qwen) 系列" };
  if (id.includes("kimi") || id.includes("moonshot")) return { familyId: "kimi", familyName: "Kimi / Moonshot 系列" };
  if (id.includes("hunyuan")) return { familyId: "hunyuan", familyName: "混元 系列" };
  return { familyId: "other", familyName: "其他通用模型系列" };
}

type KeyItem = {
  keyId: string;
  keyLabel: string;
  apiKeyMasked?: string;
  providerId: string;
  providerName: string;
  baseUrl: string;
  priority: number;
  isEnabled: boolean;
  unhealthyUntil: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  models: Array<{ modelEntity: AiProviderKeyModel; modelId: string; displayName: string }>;
};

type ModelFamilyGroup = {
  familyId: string;
  familyName: string;
  modelIds: string[];
  keys: KeyItem[];
};

export default function ModelsClient() {
  const { bundle, isLoading, mutate, mutateEntity, swapKeyPriority, testKeyConnection, testAllKeys } = useAiConfig();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);

  // 拖拽状态变量
  const [draggedKeyId, setDraggedKeyId] = useState<string | null>(null);
  const [dropTargetKeyId, setDropTargetKeyId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below">("above");
  const [recentlyMovedKeyId, setRecentlyMovedKeyId] = useState<string | null>(null);

  const [modelModal, setModelModal] = useState<{ open: boolean; keyId: string | null; initialModelId?: string }>({
    open: false,
    keyId: null,
  });
  const [keyModal, setKeyModal] = useState<{ open: boolean; providerId: string | null }>({
    open: false,
    providerId: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null; title: string }>({
    open: false,
    id: null,
    title: "",
  });

  const familyGroups = useMemo<ModelFamilyGroup[]>(() => {
    if (!bundle) return [];

    const familyMap = new Map<string, { familyName: string; modelSet: Set<string>; keyMap: Map<string, KeyItem> }>();

    bundle.models.forEach((m) => {
      const key = bundle.keys.find((k) => k.id === m.key_id);
      if (!key) return;
      const provider = bundle.providers.find((p) => p.id === key.provider_id);
      if (!provider) return;

      const { familyId, familyName } = getModelFamily(m.model_id);

      if (!familyMap.has(familyId)) {
        familyMap.set(familyId, {
          familyName,
          modelSet: new Set<string>(),
          keyMap: new Map<string, KeyItem>(),
        });
      }

      const familyObj = familyMap.get(familyId)!;
      familyObj.modelSet.add(m.model_id);

      if (!familyObj.keyMap.has(key.id)) {
        familyObj.keyMap.set(key.id, {
          keyId: key.id,
          keyLabel: key.label,
          apiKeyMasked: key.api_key_masked,
          providerId: provider.id,
          providerName: provider.name,
          baseUrl: provider.base_url,
          priority: key.priority,
          isEnabled: key.is_enabled && provider.is_enabled,
          unhealthyUntil: key.unhealthy_until,
          consecutiveFailures: key.consecutive_failures,
          lastSuccessAt: key.last_success_at,
          lastFailureAt: key.last_failure_at,
          lastErrorMessage: key.last_error_message,
          models: [],
        });
      }

      const keyItem = familyObj.keyMap.get(key.id)!;
      keyItem.models.push({
        modelEntity: m,
        modelId: m.model_id,
        displayName: m.display_name || m.model_id,
      });
    });

    const result: ModelFamilyGroup[] = [];
    familyMap.forEach((val, familyId) => {
      const keys = Array.from(val.keyMap.values()).sort((a, b) => a.priority - b.priority);
      result.push({
        familyId,
        familyName: val.familyName,
        modelIds: Array.from(val.modelSet),
        keys,
      });
    });

    return result;
  }, [bundle]);

  const defaultBinding = useMemo(() => {
    return bundle?.featureBindings.find((b) => b.feature_key === "default");
  }, [bundle]);

  const currentDefaultModelId = useMemo(() => {
    if (!defaultBinding?.provider_key_model_id || !bundle) return null;
    const model = bundle.models.find((m) => m.id === defaultBinding.provider_key_model_id);
    return model?.model_id || null;
  }, [defaultBinding, bundle]);

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-zinc-50 animate-pulse border border-zinc-200" />
        ))}
      </div>
    );
  }

  // 0ms 瞬间响应的顺位调整（两两 swap）
  const handleSwapPriority = async (
    currentKeyId: string,
    targetKeyId: string,
    currentPriority: number,
    targetPriority: number
  ) => {
    setRecentlyMovedKeyId(currentKeyId);
    setTimeout(() => setRecentlyMovedKeyId(null), 1200);
    await swapKeyPriority(currentKeyId, targetKeyId, currentPriority, targetPriority);
  };

  // 0ms 瞬间响应的多项拖拽重排
  const handleReorderKeysInFamily = async (famKeys: KeyItem[], draggedId: string, dropTargetId: string, position: "above" | "below") => {
    if (draggedId === dropTargetId || !bundle) return;

    const fromIdx = famKeys.findIndex((k) => k.keyId === draggedId);
    let toIdx = famKeys.findIndex((k) => k.keyId === dropTargetId);

    if (fromIdx === -1 || toIdx === -1) return;
    if (position === "below") toIdx += 1;
    if (fromIdx < toIdx) toIdx -= 1;

    if (fromIdx === toIdx) return;

    // 拷贝并重新排列组内 keys
    const newFamKeys = [...famKeys];
    const [draggedItem] = newFamKeys.splice(fromIdx, 1);
    newFamKeys.splice(toIdx, 0, draggedItem);

    // 收集所有修改过的 keys 的优先级映射
    const priorityMap = new Map<string, number>();
    famKeys.forEach((oldK, idx) => {
      priorityMap.set(newFamKeys[idx].keyId, oldK.priority);
    });

    // 1. 0ms 瞬间乐观更新本地 bundle 状态
    const updatedKeys = bundle.keys.map((k) => {
      if (priorityMap.has(k.id)) {
        return { ...k, priority: priorityMap.get(k.id)! };
      }
      return k;
    });

    mutate({ ...bundle, keys: updatedKeys });

    setRecentlyMovedKeyId(draggedId);
    setTimeout(() => setRecentlyMovedKeyId(null), 1200);

    // 2. 提交后端持久化：两两进行必要的 priority 变更
    const targetKey = famKeys[toIdx > fromIdx ? toIdx : toIdx];
    const sourceKey = famKeys[fromIdx];
    if (targetKey && sourceKey) {
      await swapKeyPriority(draggedId, targetKey.keyId, sourceKey.priority, targetKey.priority);
    }
  };

  const handleSetGlobalDefault = async (modelId: string) => {
    const targetModel = bundle.models.find((m) => m.model_id === modelId && m.is_enabled);
    if (!targetModel) return;

    if (defaultBinding) {
      await mutateEntity("update", "feature_binding", {
        id: defaultBinding.id,
        provider_key_model_id: targetModel.id,
      });
    } else {
      await mutateEntity("create", "feature_binding", {
        feature_key: "default",
        label: "全局默认 AI 模型",
        provider_key_model_id: targetModel.id,
      });
    }
  };

  const handleTest = async (keyId: string, modelId?: string) => {
    setTestingKeyId(keyId);
    await testKeyConnection(keyId, modelId);
    setTestingKeyId(null);
  };

  const handleTestAll = async () => {
    setIsTestingAll(true);
    await testAllKeys();
    setIsTestingAll(false);
  };

  const handleDeleteModel = async () => {
    if (!deleteConfirm.id) return;
    await mutateEntity("delete", "model", { id: deleteConfirm.id });
    setDeleteConfirm({ open: false, id: null, title: "" });
  };

  return (
    <div className="space-y-5">
      {/* 规范 2.2：自然色差 Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-100/70 p-2.5 px-3.5 rounded-xl border border-zinc-200/50">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[#D97757]" />
          <span className="text-[13px] font-medium text-zinc-900">全局默认主模型：</span>
          <select
            className="h-8 px-2.5 text-[12px] rounded-lg border border-zinc-200 bg-white font-medium text-zinc-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/40"
            value={currentDefaultModelId || ""}
            onChange={(e) => handleSetGlobalDefault(e.target.value)}
          >
            <option value="" disabled>-- 选择全局默认主型号 --</option>
            {bundle.models.map((m) => {
              const key = bundle.keys.find((k) => k.id === m.key_id);
              const provider = bundle.providers.find((p) => p.id === key?.provider_id);
              const isKeyHealthy = key?.is_enabled && (!key.unhealthy_until || new Date(key.unhealthy_until).getTime() <= Date.now());
              const isEnabled = m.is_enabled && (key ? key.is_enabled : true) && (provider ? provider.is_enabled : true);
              const statusPrefix = !isEnabled ? "- [已停用]" : isKeyHealthy ? "• [正常]" : "× [异常]";

              return (
                <option key={m.id} value={m.model_id} disabled={!isEnabled} className={!isEnabled ? "text-zinc-400" : ""}>
                  {statusPrefix} {m.display_name || m.model_id} ({provider?.name || "未知渠道"})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isTestingAll}
            onClick={handleTestAll}
            className="h-7 text-[12px] gap-1 bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700"
          >
            {isTestingAll ? <Loader2 className="size-3 animate-spin text-[#D97757]" /> : <Zap className="size-3 text-[#D97757] fill-[#D97757]" />}
            一键全池健康检测
          </Button>

          {bundle.providers.length === 0 ? (
            <Button size="sm" className="h-7 text-[12px] gap-1 bg-[#D97757] hover:bg-[#C46A4D] text-white" onClick={() => setKeyModal({ open: true, providerId: null })}>
              <Plus className="size-3" /> 首次配置渠道与 Key
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-[12px] gap-1 bg-[#D97757] hover:bg-[#C46A4D] text-white" onClick={() => setModelModal({ open: true, keyId: bundle.keys[0]?.id || null })}>
              <Plus className="size-3" /> 给系列添加型号
            </Button>
          )}
        </div>
      </div>

      {/* 模型系列卡片列表 */}
      {familyGroups.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50/70 p-12 text-center space-y-3 border border-zinc-200/80">
          <p className="text-[13px] text-zinc-500">暂无配置。请添加你的 API Key 和对应的模型系列。</p>
          <Button size="sm" className="bg-[#D97757] hover:bg-[#C46A4D] text-white" onClick={() => setKeyModal({ open: true, providerId: null })}>
            <Plus className="size-4 mr-1.5" /> 添加首个 API Key
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {familyGroups.map((fam) => {
            const hasGlobalDefault = fam.modelIds.includes(currentDefaultModelId || "");

            return (
              <div
                key={fam.familyId}
                className={cn(
                  "rounded-2xl bg-white overflow-hidden transition-all border border-zinc-200 shadow-sm",
                  hasGlobalDefault && "ring-1 ring-[#D97757]/30"
                )}
              >
                {/* 系列 Card Header */}
                <div className="p-4 px-5 bg-zinc-50/80 space-y-2.5 border-b border-zinc-200/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-[14px] text-zinc-900">{fam.familyName}</span>
                      {hasGlobalDefault && (
                        <span className="text-[11px] font-medium bg-[#D97757]/10 text-[#D97757] px-2 py-0.5 rounded-full">
                          全局默认
                        </span>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] gap-1 bg-white border-zinc-200 hover:bg-zinc-100"
                      onClick={() => {
                        const firstKeyId = fam.keys[0]?.keyId || bundle.keys[0]?.id || null;
                        setModelModal({ open: true, keyId: firstKeyId });
                      }}
                    >
                      <Plus className="size-3" /> 添加系列内型号
                    </Button>
                  </div>

                  {/* 包含的具体型号 Tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                      <Tag className="size-3" /> 包含 {fam.modelIds.length} 个具体型号：
                    </span>
                    {fam.modelIds.map((mId) => (
                      <span
                        key={mId}
                        className={cn(
                          "font-mono text-[11px] px-2 py-0.5 rounded-md",
                          mId === currentDefaultModelId
                            ? "bg-[#D97757]/10 text-[#D97757] font-semibold border border-[#D97757]/30"
                            : "bg-white text-zinc-600 border border-zinc-200"
                        )}
                      >
                        {mId}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 顺位列表表格 */}
                <Table>
                  <TableHeader className="bg-zinc-50/30">
                    <TableRow className="hover:bg-transparent border-b border-zinc-200/60">
                      <TableHead className="w-[40px] px-2 text-center text-[12px]"></TableHead>
                      <TableHead className="w-[60px] text-[12px] pl-2">顺位</TableHead>
                      <TableHead className="text-[12px]">供应商 / Key 名称</TableHead>
                      <TableHead className="text-[12px]">Base URL</TableHead>
                      <TableHead className="text-[12px]">API Key 掩码</TableHead>
                      <TableHead className="text-[12px]">健康状态</TableHead>
                      <TableHead className="text-right text-[12px] pr-5">顺位与连通测试</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fam.keys.map((keyItem, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === fam.keys.length - 1;
                      const healthStatus = getProviderKeyHealthStatus({
                        isEnabled: keyItem.isEnabled,
                        lastSuccessAt: keyItem.lastSuccessAt,
                        lastFailureAt: keyItem.lastFailureAt,
                        unhealthyUntil: keyItem.unhealthyUntil,
                      });

                      const isDragging = draggedKeyId === keyItem.keyId;
                      const isDropTarget = dropTargetKeyId === keyItem.keyId;
                      const isRecentlyMoved = recentlyMovedKeyId === keyItem.keyId;

                      return (
                        <TableRow
                          key={keyItem.keyId}
                          draggable={true}
                          onDragStart={(e) => {
                            setDraggedKeyId(keyItem.keyId);
                            e.dataTransfer.setData("text/plain", keyItem.keyId);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggedKeyId(null);
                            setDropTargetKeyId(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";

                            if (draggedKeyId && draggedKeyId !== keyItem.keyId) {
                              setDropTargetKeyId(keyItem.keyId);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const midY = rect.top + rect.height / 2;
                              setDropPosition(e.clientY < midY ? "above" : "below");
                            }
                          }}
                          onDragLeave={() => {
                            if (dropTargetKeyId === keyItem.keyId) {
                              setDropTargetKeyId(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const draggedId = e.dataTransfer.getData("text/plain");
                            if (draggedId && draggedId !== keyItem.keyId) {
                              handleReorderKeysInFamily(fam.keys, draggedId, keyItem.keyId, dropPosition);
                            }
                            setDraggedKeyId(null);
                            setDropTargetKeyId(null);
                          }}
                          className={cn(
                            "text-[13px] border-b border-zinc-200/60 last:border-b-0 transition-colors select-none group",
                            isDragging && "opacity-40 bg-zinc-100/70 border-dashed border-zinc-300",
                            !isDragging && isDropTarget && dropPosition === "above" && "border-t-2 border-t-[#D97757] bg-[#D97757]/5",
                            !isDragging && isDropTarget && dropPosition === "below" && "border-b-2 border-b-[#D97757] bg-[#D97757]/5",
                            !isDragging && !isDropTarget && isRecentlyMoved && "bg-[#D97757]/10 transition-colors duration-1000",
                            !isDragging && !isDropTarget && !isRecentlyMoved && "hover:bg-zinc-50/70"
                          )}
                        >
                          {/* 拖拽手柄列 */}
                          <TableCell className="w-[40px] px-2 text-center">
                            <div className="inline-flex items-center justify-center p-1 rounded hover:bg-zinc-200/60 cursor-grab active:cursor-grabbing text-zinc-400 group-hover:text-zinc-600 transition-colors">
                              <GripVertical className="size-4" />
                            </div>
                          </TableCell>

                          {/* 顺位数字 Badge */}
                          <TableCell className="pl-2 font-mono">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center size-5.5 rounded-md text-[11px] font-medium transition-transform duration-200",
                                isFirst
                                  ? "bg-[#D97757] text-white shadow-sm scale-105"
                                  : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                              )}
                            >
                              {idx + 1}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="font-medium text-zinc-900">{keyItem.keyLabel}</div>
                            <div className="text-[11px] text-zinc-500">{keyItem.providerName}</div>
                          </TableCell>

                          <TableCell className="font-mono text-[12px] text-zinc-500 max-w-[180px] truncate">
                            {keyItem.baseUrl}
                          </TableCell>

                          <TableCell className="font-mono text-[12px] text-zinc-500">
                            {keyItem.apiKeyMasked || "***"}
                          </TableCell>

                          <TableCell>
                            {healthStatus === "healthy" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full font-medium">
                                <CheckCircle2 className="size-3 text-emerald-600" /> 正常
                              </span>
                            ) : healthStatus === "untested" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full font-medium">
                                未测试
                              </span>
                            ) : healthStatus === "disabled" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full font-medium">
                                已停用
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full font-medium" title={keyItem.lastErrorMessage || undefined}>
                                <AlertTriangle className="size-3 text-red-600" /> 异常/离线
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-right pr-5">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[12px] gap-1 text-zinc-600 hover:text-[#D97757] hover:bg-[#D97757]/10 active:scale-95"
                                disabled={testingKeyId === keyItem.keyId}
                                onClick={() => handleTest(keyItem.keyId, keyItem.models[0]?.modelId)}
                              >
                                {testingKeyId === keyItem.keyId ? (
                                  <Loader2 className="size-3 animate-spin text-[#D97757]" />
                                ) : (
                                  <Zap className="size-3 fill-current text-[#D97757]" />
                                )}
                                测试
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}

      <ModelDialog
        open={modelModal.open}
        keyId={modelModal.keyId}
        initialModelId={modelModal.initialModelId}
        onOpenChange={(c) => setModelModal({ ...modelModal, open: c })}
        onSave={async (data) => {
          const ok = await mutateEntity("create", "model", data);
          if (ok) setModelModal({ open: false, keyId: null });
        }}
      />
      <KeyDialog
        apiKey={null}
        open={keyModal.open}
        providerId={keyModal.providerId}
        onOpenChange={(c) => setKeyModal({ ...keyModal, open: c })}
        onSave={async (data) => {
          const ok = await mutateEntity("create", "key", data);
          if (ok) setKeyModal({ open: false, providerId: null });
        }}
      />
      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        description="确定要移除吗？"
        confirmText="确认移除"
        cancelText="取消"
        onConfirm={handleDeleteModel}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
      />
    </div>
  );
}
