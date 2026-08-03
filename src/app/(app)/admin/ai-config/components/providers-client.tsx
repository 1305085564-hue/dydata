"use client";

import { useState } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { Plus, Pencil, Trash2, Zap, Server, CheckCircle2, AlertTriangle, Loader2, Key, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderDialog, KeyDialog, ModelDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

export default function ProvidersClient() {
  const { bundle, isLoading, mutateEntity, testKeyConnection } = useAiConfig();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({
    open: false,
    data: null,
  });
  const [keyModal, setKeyModal] = useState<{ open: boolean; providerId: string | null; data: Partial<AiProviderKey> | null }>({
    open: false,
    providerId: null,
    data: null,
  });
  const [modelModal, setModelModal] = useState<{ open: boolean; keyId: string | null; data: Partial<AiProviderKeyModel> | null }>({
    open: false,
    keyId: null,
    data: null,
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    entity: "provider" | "key" | "model" | null;
    id: string | null;
    title: string;
  }>({ open: false, entity: null, id: null, title: "" });

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 rounded-2xl bg-zinc-50 animate-pulse border border-zinc-200" />
        ))}
      </div>
    );
  }

  const handleSaveProvider = async (data: Record<string, unknown>) => {
    const action = providerModal.data?.id ? "update" : "create";
    if (action === "update") data.id = providerModal.data?.id;
    const ok = await mutateEntity(action, "provider", data);
    if (ok) setProviderModal({ open: false, data: null });
  };

  const handleSaveKey = async (data: Record<string, unknown>) => {
    const action = keyModal.data?.id ? "update" : "create";
    if (action === "update") data.id = keyModal.data?.id;
    const ok = await mutateEntity(action, "key", data);
    if (ok) setKeyModal({ open: false, providerId: null, data: null });
  };

  const handleSaveModel = async (data: Record<string, unknown>) => {
    const action = modelModal.data?.id ? "update" : "create";
    if (action === "update") data.id = modelModal.data?.id;
    if (action === "create" && !data.display_name) {
      data.display_name = data.model_id;
    }
    const ok = await mutateEntity(action, "model", data);
    if (ok) setModelModal({ open: false, keyId: null, data: null });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.entity || !deleteConfirm.id) return;
    await mutateEntity("delete", deleteConfirm.entity, { id: deleteConfirm.id });
    setDeleteConfirm({ open: false, entity: null, id: null, title: "" });
  };

  const handleTestKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    await testKeyConnection(keyId);
    setTestingKeyId(null);
  };

  return (
    <div className="space-y-5">
      {/* 规范 2.2：极简浅灰槽底单行 Header，无割裂下划线 */}
      <div className="flex items-center justify-between bg-zinc-100/70 p-2.5 px-3.5 rounded-xl">
        <span className="text-[13px] font-medium text-zinc-900">第三方中转站 Base URL 与 API 密钥池</span>
        <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setProviderModal({ open: true, data: null })}>
          <Plus className="size-3" /> 新建服务商渠道
        </Button>
      </div>

      {/* 服务商渠道列表 */}
      {bundle.providers.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50/70 p-12 text-center space-y-3">
          <Server className="size-8 text-zinc-400 mx-auto" />
          <p className="text-[13px] text-zinc-500">暂无供应商渠道。请先添加第三方中转站或 API 服务商。</p>
          <Button size="sm" onClick={() => setProviderModal({ open: true, data: null })}>
            <Plus className="size-4 mr-1.5" /> 添加首个渠道
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {bundle.providers.map((p) => {
            const providerKeys = bundle.keys.filter((k) => k.provider_id === p.id);

            return (
              <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden transition-all">
                {/* 规范 119：依靠 zinc-50/80 与 white 色差天然分层，无 border-b 横划线 */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 bg-zinc-50/80">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-zinc-200/60 flex items-center justify-center text-zinc-700">
                      <Server className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[14px] text-zinc-900">{p.name}</span>
                        {!p.is_enabled && (
                          <span className="text-[11px] font-medium bg-zinc-200/80 text-zinc-600 px-1.5 py-0.2 rounded">
                            已停用
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[12px] text-zinc-500 mt-0.5">{p.base_url}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label={`启用渠道 ${p.name}`}
                      className="scale-75 origin-right"
                      checked={p.is_enabled}
                      onCheckedChange={(checked) => mutateEntity("update", "provider", { id: p.id, is_enabled: checked })}
                    />
                    <Button variant="outline" size="sm" className="h-7 text-[12px] bg-white border-zinc-200" onClick={() => setProviderModal({ open: true, data: p })}>
                      <Pencil className="size-3 mr-1" /> 编辑
                    </Button>
                    <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setKeyModal({ open: true, providerId: p.id, data: null })}>
                      <Plus className="size-3" /> 新建 Key
                    </Button>
                  </div>
                </div>

                {/* 所属 Key 列表 */}
                <Table>
                  <TableHeader className="bg-transparent">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="text-[12px] pl-5">Key 分组名称</TableHead>
                      <TableHead className="text-[12px]">API Key 掩码</TableHead>
                      <TableHead className="text-[12px]">健康与测试</TableHead>
                      <TableHead className="text-[12px]">已关联模型数</TableHead>
                      <TableHead className="w-[80px] text-[12px]">启用</TableHead>
                      <TableHead className="text-right text-[12px] pr-5">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerKeys.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-[13px] text-zinc-400 border-0">
                          暂无 API 密钥分组，请点击右上角新建 Key
                        </TableCell>
                      </TableRow>
                    ) : (
                      providerKeys.map((keyItem) => {
                        const healthStatus = getProviderKeyHealthStatus({
                          isEnabled: keyItem.is_enabled && p.is_enabled,
                          lastSuccessAt: keyItem.last_success_at,
                          lastFailureAt: keyItem.last_failure_at,
                          unhealthyUntil: keyItem.unhealthy_until,
                        });
                        const keyModelsCount = bundle.models.filter((m) => m.key_id === keyItem.id).length;

                        return (
                          <TableRow key={keyItem.id} className="hover:bg-zinc-50/50 text-[13px] border-b border-zinc-200/60 last:border-b-0">
                            <TableCell className="pl-5 font-medium text-zinc-900">
                              <div className="flex items-center gap-1.5">
                                <Key className="size-3.5 text-zinc-400" />
                                {keyItem.label}
                              </div>
                            </TableCell>

                            <TableCell className="font-mono text-[12px] text-zinc-500">
                              {keyItem.api_key_masked || "***"}
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
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
                                  <span className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full font-medium" title={keyItem.last_error_message || undefined}>
                                    <AlertTriangle className="size-3 text-red-600" /> 异常/离线
                                  </span>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[11px] text-zinc-600 hover:text-[#D97757]"
                                  disabled={testingKeyId === keyItem.id}
                                  onClick={() => handleTestKey(keyItem.id)}
                                >
                                  {testingKeyId === keyItem.id ? (
                                    <Loader2 className="size-3 animate-spin mr-1" />
                                  ) : (
                                    <Zap className="size-3 fill-current mr-1" />
                                  )}
                                  测试
                                </Button>
                              </div>
                            </TableCell>

                            <TableCell className="text-[12px] text-zinc-500">
                              {keyModelsCount} 个模型
                            </TableCell>

                            <TableCell>
                              <Switch
                                aria-label={`启用分组 ${keyItem.label}`}
                                className="scale-75 origin-left"
                                checked={keyItem.is_enabled}
                                onCheckedChange={(checked) => mutateEntity("update", "key", { id: keyItem.id, is_enabled: checked })}
                              />
                            </TableCell>

                            <TableCell className="text-right pr-5">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-zinc-500 hover:text-[#D97757]"
                                  onClick={() => setModelModal({ open: true, keyId: keyItem.id, data: null })}
                                  title="管理此 Key 关联的模型"
                                >
                                  <Tag className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-zinc-500 hover:text-zinc-700"
                                  onClick={() => setKeyModal({ open: true, providerId: p.id, data: keyItem })}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-zinc-500 hover:text-[#C9604D]"
                                  onClick={() => setDeleteConfirm({ open: true, entity: "key", id: keyItem.id, title: `删除密钥分组 ${keyItem.label}` })}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
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

      <ProviderDialog
        open={providerModal.open}
        provider={providerModal.data}
        onOpenChange={(c) => setProviderModal({ ...providerModal, open: c })}
        onSave={handleSaveProvider}
      />
      <KeyDialog
        apiKey={null}
        open={keyModal.open}
        providerId={keyModal.providerId}
        onOpenChange={(c) => setKeyModal({ ...keyModal, open: c })}
        onSave={handleSaveKey}
      />
      <ModelDialog
        open={modelModal.open}
        model={modelModal.data}
        keyId={modelModal.keyId}
        onOpenChange={(c) => setModelModal({ ...modelModal, open: c })}
        onSave={handleSaveModel}
      />
      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        description="此操作无法撤销，确定要删除吗？"
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={handleDelete}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
      />
    </div>
  );
}
