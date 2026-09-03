"use client";

import { useMemo, useState } from "react";
import {
  AiProviderKeyModel,
  useAiConfig,
} from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Zap,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Tag,
  GripVertical,
  RefreshCw,
  ChevronDown,
  X,
} from "lucide-react";
import { ModelDialog, KeyDialog } from "./providers-dialogs";
import { SyncModelsDialog } from "./sync-models-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

// 智能模型系列映射
function getModelFamily(modelId: string): {
  familyId: string;
  familyName: string;
} {
  const id = modelId.toLowerCase();
  if (id.includes("claude"))
    return { familyId: "claude", familyName: "Claude 模型系列" };
  if (
    id.includes("gpt") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("openai")
  ) {
    return { familyId: "openai", familyName: "OpenAI / ChatGPT 系列" };
  }
  if (id.includes("deepseek"))
    return { familyId: "deepseek", familyName: "DeepSeek 系列" };
  if (id.includes("gemini"))
    return { familyId: "gemini", familyName: "Gemini 系列" };
  if (id.includes("qwen") || id.includes("tongyi"))
    return { familyId: "qwen", familyName: "通义千问 (Qwen) 系列" };
  if (id.includes("kimi") || id.includes("moonshot"))
    return { familyId: "kimi", familyName: "Kimi / Moonshot 系列" };
  if (id.includes("hunyuan"))
    return { familyId: "hunyuan", familyName: "混元 系列" };
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
  models: Array<{
    modelEntity: AiProviderKeyModel;
    modelId: string;
    displayName: string;
  }>;
};

type ModelFamilyGroup = {
  familyId: string;
  familyName: string;
  modelIds: string[];
  keys: KeyItem[];
};

export default function ModelsClient() {
  const {
    bundle,
    isLoading,
    mutate,
    mutateEntity,
    swapKeyPriority,
    testKeyConnection,
    testAllKeys,
    syncKeyModels,
    setKeyModelSelection,
  } = useAiConfig();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [syncingKeyId, setSyncingKeyId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);

  // 系列卡片选中的具体型号映射：familyId -> modelId
  const [selectedModelByFamily, setSelectedModelByFamily] = useState<
    Record<string, string>
  >({});

  // 拖拽状态变量
  const [draggedKeyId, setDraggedKeyId] = useState<string | null>(null);
  const [dropTargetKeyId, setDropTargetKeyId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below">("above");
  const [recentlyMovedKeyId, setRecentlyMovedKeyId] = useState<string | null>(
    null,
  );

  const [modelModal, setModelModal] = useState<{
    open: boolean;
    keyId: string | null;
    initialModelId?: string;
  }>({
    open: false,
    keyId: null,
  });
  const [keyModal, setKeyModal] = useState<{
    open: boolean;
    providerId: string | null;
  }>({
    open: false,
    providerId: null,
  });

  // 同步模型列表弹窗状态
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

  // 从系列中删除型号确认弹窗
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<{
    open: boolean;
    modelId: string | null;
    familyId: string | null;
  }>({
    open: false,
    modelId: null,
    familyId: null,
  });

  const familyGroups = useMemo<ModelFamilyGroup[]>(() => {
    if (!bundle) return [];

    const familyMap = new Map<
      string,
      {
        familyName: string;
        modelSet: Set<string>;
        keyMap: Map<string, KeyItem>;
      }
    >();

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
      const keys = Array.from(val.keyMap.values()).sort(
        (a, b) => a.priority - b.priority,
      );
      result.push({
        familyId,
        familyName: val.familyName,
        modelIds: Array.from(val.modelSet),
        keys,
      });
    });

    return result;
  }, [bundle]);

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-[#FBF9F5] animate-pulse border border-[#E5E0D6]"
          />
        ))}
      </div>
    );
  }

  // 0ms 瞬间响应的多项拖拽重排
  const handleReorderKeysInFamily = async (
    famKeys: KeyItem[],
    draggedId: string,
    dropTargetId: string,
    position: "above" | "below",
  ) => {
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
      await swapKeyPriority(
        draggedId,
        targetKey.keyId,
        sourceKey.priority,
        targetKey.priority,
      );
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

  const handleSyncKeyModelsClick = async (keyItem: KeyItem) => {
    setSyncingKeyId(keyItem.keyId);
    try {
      const syncResult = await syncKeyModels(keyItem.keyId);
      if (syncResult && syncResult.models) {
        setSyncDialog({
          open: true,
          keyId: keyItem.keyId,
          keyLabel: keyItem.keyLabel,
          providerName: keyItem.providerName,
          availableModels: syncResult.models,
          initialSelectedModelIds: keyItem.models.map((m) => m.modelId),
        });
      }
    } finally {
      setSyncingKeyId(null);
    }
  };

  const handleConfirmDeleteModelFromFamily = async () => {
    const targetModelId = deleteModelConfirm.modelId;
    if (!targetModelId || !bundle) return;

    // 找出包含该型号的所有 key_id
    const affectedKeyIds = Array.from(
      new Set(
        bundle.models
          .filter((m) => m.model_id === targetModelId)
          .map((m) => m.key_id),
      ),
    );

    // 依次对每个 key 调用 setKeyModelSelection 移除该型号
    for (const keyId of affectedKeyIds) {
      const currentModelIds = bundle.models
        .filter((m) => m.key_id === keyId)
        .map((m) => m.model_id);
      const remaining = currentModelIds.filter((id) => id !== targetModelId);
      if (remaining.length > 0) {
        await setKeyModelSelection(keyId, remaining);
      } else {
        // 如果该 key 只包含此唯一型号，setKeyModelSelection 会拒绝空数组，此时直接删除 model entity
        const modelEntity = bundle.models.find(
          (m) => m.key_id === keyId && m.model_id === targetModelId,
        );
        if (modelEntity) {
          await mutateEntity("delete", "model", { id: modelEntity.id });
        }
      }
    }

    // 若当前选中的正是被删除的型号，清理选中态
    if (deleteModelConfirm.familyId) {
      const famId = deleteModelConfirm.familyId;
      setSelectedModelByFamily((prev) => {
        if (prev[famId] === targetModelId) {
          const next = { ...prev };
          delete next[famId];
          return next;
        }
        return prev;
      });
    }

    setDeleteModelConfirm({ open: false, modelId: null, familyId: null });
  };

  return (
    <div className="space-y-5">
      {/* 自然色差 Header Bar (微气垫平铺) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F5F3EE]/70 p-2 px-3 rounded-xl select-none">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isTestingAll}
            onClick={handleTestAll}
            className="h-7 text-[12px] gap-1.5 bg-white border-[#E5E0D6] hover:bg-[#F5F3EE] text-[#292524]"
          >
            {isTestingAll ? (
              <Loader2 className="size-3 animate-spin text-[#D97757]" />
            ) : (
              <Zap className="size-3 text-[#D97757] fill-[#D97757]" />
            )}
            探测密钥连通状态
          </Button>

          {bundle.providers.length === 0 ? (
            <Button
              size="sm"
              className="h-7 text-[12px] gap-1 bg-[#D97757] hover:bg-[#C46A4D] text-white"
              onClick={() => setKeyModal({ open: true, providerId: null })}
            >
              <Plus className="size-3" /> 添加首个渠道密钥
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-[12px] gap-1 bg-[#D97757] hover:bg-[#C46A4D] text-white"
              onClick={() =>
                setModelModal({ open: true, keyId: bundle.keys[0]?.id || null })
              }
            >
              <Plus className="size-3" /> 接入新型号
            </Button>
          )}
        </div>
      </div>

      {/* 模型系列卡片列表 */}
      {familyGroups.length === 0 ? (
        <div className="rounded-2xl bg-[#FBF9F5]/70 p-12 text-center space-y-3 border border-[#E5E0D6]/80">
          <p className="text-[13px] text-[#78716C]">
            尚未接入可用型号系列。添加 API 密钥后，将自动识别并归类呈现。
          </p>
          <Button
            size="sm"
            className="bg-[#D97757] hover:bg-[#C46A4D] text-white"
            onClick={() => setKeyModal({ open: true, providerId: null })}
          >
            <Plus className="size-4 mr-1.5" /> 添加首个渠道密钥
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {familyGroups.map((fam) => {
            // 当前卡片选中的具体型号（默认选中第 1 个）
            const activeModelId =
              selectedModelByFamily[fam.familyId] &&
              fam.modelIds.includes(selectedModelByFamily[fam.familyId])
                ? selectedModelByFamily[fam.familyId]
                : fam.modelIds[0] || null;

            // 过滤支持该型号的渠道 Key
            const filteredKeys = activeModelId
              ? fam.keys.filter((keyItem) =>
                  keyItem.models.some((m) => m.modelId === activeModelId),
                )
              : fam.keys;

            return (
              <div
                key={fam.familyId}
                className="rounded-2xl bg-white overflow-hidden transition-all border border-[#E5E0D6] shadow-sm"
              >
                {/* 系列 Card Header */}
                <div className="p-4 px-5 bg-[#FBF9F5]/80 space-y-2.5 border-b border-[#E5E0D6]/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-medium text-[14px] text-[#1C1917]">
                        {fam.familyName}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] gap-1 bg-white border-[#E5E0D6] hover:bg-[#F5F3EE]"
                      onClick={() => {
                        const firstKeyId =
                          fam.keys[0]?.keyId || bundle.keys[0]?.id || null;
                        setModelModal({ open: true, keyId: firstKeyId });
                      }}
                    >
                      <Plus className="size-3" /> 添加型号
                    </Button>
                  </div>

                  {/* 包含的具体型号 Tags：可单选切换高亮 + Hover 删除 */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-[#78716C] flex items-center gap-1 select-none">
                      <Tag className="size-3" /> 包含型号 ({fam.modelIds.length})：
                    </span>
                    {fam.modelIds.map((mId) => {
                      const isSelected = mId === activeModelId;
                      return (
                        <div
                          key={mId}
                          onClick={() =>
                            setSelectedModelByFamily((prev) => ({
                              ...prev,
                              [fam.familyId]: mId,
                            }))
                          }
                          className={cn(
                            "group relative inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-mono cursor-pointer transition-all border select-none active:scale-[0.99] active:duration-120",
                            isSelected
                              ? "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/30 font-medium shadow-2xs"
                              : "bg-white text-[#292524] border-[#E5E0D6] hover:bg-[#F5F3EE]",
                          )}
                        >
                          <span>{mId}</span>
                          <button
                            type="button"
                            title={`从系列中删除 ${mId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModelConfirm({
                                open: true,
                                modelId: mId,
                                familyId: fam.familyId,
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#C0685C]/15 hover:text-[#C0685C] text-[#78716C]"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 顺位列表表格 */}
                <Table>
                  <TableHeader className="bg-[#FBF9F5]/30">
                    <TableRow className="hover:bg-transparent border-b border-[#E5E0D6]/60">
                      <TableHead className="w-[40px] px-2 text-center text-[12px]"></TableHead>
                      <TableHead className="w-[60px] text-[12px] pl-2">
                        顺位
                      </TableHead>
                      <TableHead className="text-[12px]">
                        供应商 / Key 名称
                      </TableHead>
                      <TableHead className="text-[12px]">Base URL</TableHead>
                      <TableHead className="text-[12px]">
                        API Key 掩码
                      </TableHead>
                      <TableHead className="text-[12px]">健康状态</TableHead>
                      <TableHead className="text-right text-[12px] pr-5">
                        调度与连通测试
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKeys.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-[12px] text-[#78716C]"
                        >
                          还没有支持当前型号 ({activeModelId}) 的可用密钥
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredKeys.map((keyItem, idx) => {
                        const isFirst = idx === 0;
                        const healthStatus = getProviderKeyHealthStatus({
                          isEnabled: keyItem.isEnabled,
                          lastSuccessAt: keyItem.lastSuccessAt,
                          lastFailureAt: keyItem.lastFailureAt,
                          unhealthyUntil: keyItem.unhealthyUntil,
                        });

                        const isDragging = draggedKeyId === keyItem.keyId;
                        const isDropTarget = dropTargetKeyId === keyItem.keyId;
                        const isRecentlyMoved =
                          recentlyMovedKeyId === keyItem.keyId;

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

                              if (
                                draggedKeyId &&
                                draggedKeyId !== keyItem.keyId
                              ) {
                                setDropTargetKeyId(keyItem.keyId);
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const midY = rect.top + rect.height / 2;
                                setDropPosition(
                                  e.clientY < midY ? "above" : "below",
                                );
                              }
                            }}
                            onDragLeave={() => {
                              if (dropTargetKeyId === keyItem.keyId) {
                                setDropTargetKeyId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedId =
                                e.dataTransfer.getData("text/plain");
                              if (draggedId && draggedId !== keyItem.keyId) {
                                handleReorderKeysInFamily(
                                  fam.keys,
                                  draggedId,
                                  keyItem.keyId,
                                  dropPosition,
                                );
                              }
                              setDraggedKeyId(null);
                              setDropTargetKeyId(null);
                            }}
                            className={cn(
                              "text-[13px] border-b border-[#E5E0D6]/60 last:border-b-0 transition-colors select-none group",
                              isDragging &&
                                "opacity-40 bg-[#F5F3EE]/70 border-dashed border-[#E5E0D6]",
                              !isDragging &&
                                isDropTarget &&
                                dropPosition === "above" &&
                                "border-t-2 border-t-[#D97757] bg-[#D97757]/5",
                              !isDragging &&
                                isDropTarget &&
                                dropPosition === "below" &&
                                "border-b-2 border-b-[#D97757] bg-[#D97757]/5",
                              !isDragging &&
                                !isDropTarget &&
                                isRecentlyMoved &&
                                "bg-[#D97757]/10 transition-colors duration-1000",
                              !isDragging &&
                                !isDropTarget &&
                                !isRecentlyMoved &&
                                "hover:bg-[#FBF9F5]/70",
                            )}
                          >
                            {/* 拖拽手柄列 */}
                            <TableCell className="w-[40px] px-2 text-center">
                              <div className="inline-flex items-center justify-center p-1 rounded hover:bg-[#E5E0D6]/60 cursor-grab active:cursor-grabbing text-[#78716C] group-hover:text-[#292524] transition-colors">
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
                                    : "bg-[#F5F3EE] text-[#292524] border border-[#E5E0D6]",
                                )}
                              >
                                {idx + 1}
                              </span>
                            </TableCell>

                            <TableCell>
                              <div className="font-medium text-[#1C1917]">
                                {keyItem.keyLabel}
                              </div>
                              <div className="text-[11px] text-[#78716C]">
                                {keyItem.providerName}
                              </div>
                            </TableCell>

                            <TableCell className="font-mono text-[12px] text-[#78716C] max-w-[180px] truncate">
                              {keyItem.baseUrl}
                            </TableCell>

                            <TableCell className="font-mono text-[12px] text-[#78716C]">
                              {keyItem.apiKeyMasked || "***"}
                            </TableCell>

                            <TableCell>
                              {healthStatus === "healthy" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#292524] bg-[#6FAA7D]/10 border border-[#E5E0D6]/60 px-2 py-0.5 rounded-full font-medium">
                                  <CheckCircle2 className="size-3 text-[#6FAA7D]" />{" "}
                                  正常
                                </span>
                              ) : healthStatus === "untested" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#292524] bg-[#F5F3EE] border border-[#E5E0D6] px-2 py-0.5 rounded-full font-medium">
                                  未测试
                                </span>
                              ) : healthStatus === "disabled" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#78716C] bg-[#F5F3EE] border border-[#E5E0D6] px-2 py-0.5 rounded-full font-medium">
                                  已停用
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] text-[#C0685C] bg-[#C0685C]/10 border border-[#C0685C]/20 px-2 py-0.5 rounded-full font-medium"
                                  title={keyItem.lastErrorMessage || undefined}
                                >
                                  <AlertTriangle className="size-3 text-[#C0685C]" />{" "}
                                  异常/离线
                                </span>
                              )}
                            </TableCell>

                            {/* 操作与连通测试 */}
                            <TableCell className="text-right pr-5">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* 同步模型按钮 */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[12px] gap-1 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] active:scale-[0.99] active:duration-120"
                                  disabled={syncingKeyId === keyItem.keyId}
                                  onClick={() =>
                                    handleSyncKeyModelsClick(keyItem)
                                  }
                                >
                                  {syncingKeyId === keyItem.keyId ? (
                                    <Loader2 className="size-3 animate-spin text-[#D97757]" />
                                  ) : (
                                    <RefreshCw className="size-3" />
                                  )}
                                  同步可用清单
                                </Button>

                                {/* 连通测试下拉按钮 */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-[12px] gap-1 text-[#292524] hover:text-[#D97757] hover:bg-[#D97757]/10 active:scale-[0.99] active:duration-120"
                                        disabled={
                                          testingKeyId === keyItem.keyId
                                        }
                                      >
                                        {testingKeyId === keyItem.keyId ? (
                                          <Loader2 className="size-3 animate-spin text-[#D97757]" />
                                        ) : (
                                          <Zap className="size-3 fill-current text-[#D97757]" />
                                        )}
                                        测试
                                        <ChevronDown className="size-3 opacity-60 ml-0.5" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-[180px] max-h-[300px] overflow-y-auto"
                                  >
                                    <DropdownMenuLabel className="text-[11px] text-[#78716C]">
                                      指定型号测试
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleTest(keyItem.keyId, undefined)
                                      }
                                      className="cursor-pointer text-[12px] flex items-center justify-between"
                                    >
                                      <span>默认顺位首选</span>
                                      <span className="text-[11px] text-[#78716C] font-mono">
                                        auto
                                      </span>
                                    </DropdownMenuItem>
                                    {keyItem.models.length > 0 && (
                                      <DropdownMenuSeparator />
                                    )}
                                    {keyItem.models.map((m) => (
                                      <DropdownMenuItem
                                        key={m.modelEntity.id}
                                        onClick={() =>
                                          handleTest(keyItem.keyId, m.modelId)
                                        }
                                        className="cursor-pointer text-[12px] font-mono"
                                      >
                                        {m.modelId}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}

      {/* 同步模型列表 + 滑动批量勾选弹窗 */}
      <SyncModelsDialog
        open={syncDialog.open}
        onOpenChange={(open) => setSyncDialog((prev) => ({ ...prev, open }))}
        keyId={syncDialog.keyId}
        keyLabel={syncDialog.keyLabel}
        providerName={syncDialog.providerName}
        availableModels={syncDialog.availableModels}
        initialSelectedModelIds={syncDialog.initialSelectedModelIds}
        onSave={async (keyId, modelIds) => {
          return await setKeyModelSelection(keyId, modelIds);
        }}
      />

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

      {/* 从系列中删除型号确认弹窗 */}
      <ConfirmDialog
        open={deleteModelConfirm.open}
        title={`确认从系列中移除型号 "${deleteModelConfirm.modelId}"？`}
        description="确认后将从当前系列中所有包含此型号的渠道 Key 中移除该型号。"
        confirmText="确认移除"
        cancelText="取消"
        destructive={true}
        onConfirm={handleConfirmDeleteModelFromFamily}
        onOpenChange={(open) =>
          setDeleteModelConfirm((prev) => ({ ...prev, open }))
        }
      />
    </div>
  );
}
