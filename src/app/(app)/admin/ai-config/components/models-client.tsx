"use client";

import { useMemo, useState } from "react";
import { AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUp, ArrowDown, Zap, Plus, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, Tag } from "lucide-react";
import { ModelDialog, KeyDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

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
  const { bundle, isLoading, mutateEntity, testKeyConnection } = useAiConfig();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

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

  const handleSwapPriority = async (
    currentKeyId: string,
    targetKeyId: string,
    currentPriority: number,
    targetPriority: number
  ) => {
    await mutateEntity("update", "key", { id: currentKeyId, priority: targetPriority });
    await mutateEntity("update", "key", { id: targetKeyId, priority: currentPriority });
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

  const handleDeleteModel = async () => {
    if (!deleteConfirm.id) return;
    await mutateEntity("delete", "model", { id: deleteConfirm.id });
    setDeleteConfirm({ open: false, id: null, title: "" });
  };

  return (
    <div className="space-y-5">
      {/* 规范 2.2：自然色差无分割线 Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-100/70 p-2.5 px-3.5 rounded-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[#D97757]" />
          <span className="text-[13px] font-medium text-zinc-900">全局默认主模型：</span>
          <select
            className="h-8 px-2.5 text-[12px] rounded-lg border-0 bg-white font-medium text-zinc-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D97757]/40"
            value={currentDefaultModelId || ""}
            onChange={(e) => handleSetGlobalDefault(e.target.value)}
          >
            <option value="" disabled>-- 选择全局默认主型号 --</option>
            {bundle.models.map((m) => (
              <option key={m.id} value={m.model_id}>
                {m.display_name || m.model_id} ({m.model_id})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {bundle.providers.length === 0 ? (
            <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setKeyModal({ open: true, providerId: null })}>
              <Plus className="size-3" /> 首次配置渠道与 Key
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setModelModal({ open: true, keyId: bundle.keys[0]?.id || null })}>
              <Plus className="size-3" /> 给系列添加型号
            </Button>
          )}
        </div>
      </div>

      {/* 模型系列卡片列表 */}
      {familyGroups.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50/70 p-12 text-center space-y-3">
          <p className="text-[13px] text-zinc-500">暂无配置。请添加你的 API Key 和对应的模型系列。</p>
          <Button size="sm" onClick={() => setKeyModal({ open: true, providerId: null })}>
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
                  "rounded-2xl bg-white overflow-hidden transition-all border border-zinc-200/80",
                  hasGlobalDefault && "ring-1 ring-[#D97757]/30"
                )}
              >
                {/* 规范 119：依靠 zinc-50/80 与 white 自然色差分层，无需 border-b 横划杠 */}
                <div className="p-4 px-5 bg-zinc-50/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-[14px] text-zinc-900">{fam.familyName}</span>
                      {hasGlobalDefault && (
                        <span className="text-[11px] font-medium bg-[#D97757]/10 text-[#D97757] px-2 py-0.5 rounded-full">
                          包含全局默认模型
                        </span>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] gap-1 bg-white border-zinc-200/80"
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
                            ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                            : "bg-white text-zinc-600 border border-zinc-200/60"
                        )}
                      >
                        {mId}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 顺位列表表格 */}
                <Table>
                  <TableHeader className="bg-transparent">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="w-[70px] text-[12px] pl-5">顺位</TableHead>
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
                      const isHealthy = keyItem.isEnabled && (!keyItem.unhealthyUntil || new Date(keyItem.unhealthyUntil).getTime() <= Date.now());

                      return (
                        <TableRow key={keyItem.keyId} className="hover:bg-zinc-50/50 text-[13px] border-b border-zinc-200/60 last:border-b-0">
                          <TableCell className="pl-5 font-mono">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center size-5.5 rounded-md text-[11px] font-bold",
                                isFirst
                                  ? "bg-[#D97757] text-white"
                                  : "bg-zinc-100 text-zinc-500"
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
                            {isHealthy ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#6FAA7D] bg-[#6FAA7D]/10 px-2 py-0.5 rounded-full font-medium">
                                <CheckCircle2 className="size-3" /> 正常
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#C9604D] bg-[#C9604D]/10 px-2 py-0.5 rounded-full font-medium" title={keyItem.lastErrorMessage || undefined}>
                                <AlertTriangle className="size-3" /> 异常/离线
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-right pr-5">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                                disabled={isFirst}
                                title="提升顺位"
                                onClick={() =>
                                  handleSwapPriority(
                                    keyItem.keyId,
                                    fam.keys[idx - 1].keyId,
                                    keyItem.priority,
                                    fam.keys[idx - 1].priority
                                  )
                                }
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                                disabled={isLast}
                                title="降低顺位"
                                onClick={() =>
                                  handleSwapPriority(
                                    keyItem.keyId,
                                    fam.keys[idx + 1].keyId,
                                    keyItem.priority,
                                    fam.keys[idx + 1].priority
                                  )
                                }
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[12px] gap-1 text-zinc-600 hover:text-[#D97757]"
                                disabled={testingKeyId === keyItem.keyId}
                                onClick={() => handleTest(keyItem.keyId, keyItem.models[0]?.modelId)}
                              >
                                {testingKeyId === keyItem.keyId ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Zap className="size-3 fill-current" />
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
