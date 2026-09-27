"use client";

import { useMemo, useState } from "react";
import {
  AiProvider,
  AiProviderKey,
  AiProviderKeyModel,
  useAiConfig,
} from "../hooks/use-ai-config";
import {
  Plus,
  Pencil,
  Trash2,
  Zap,
  Server,
  Loader2,
  Key,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { Badge } from "@/components/ui/badge";
import { ProviderDialog, KeyDialog, ModelDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

export default function ProvidersClient() {
  const { bundle, isLoading, mutateEntity, testKeyConnection } = useAiConfig();
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  const [providerModal, setProviderModal] = useState<{
    open: boolean;
    data: Partial<AiProvider> | null;
  }>({
    open: false,
    data: null,
  });
  const [keyModal, setKeyModal] = useState<{
    open: boolean;
    providerId: string | null;
    data: Partial<AiProviderKey> | null;
  }>({
    open: false,
    providerId: null,
    data: null,
  });
  const [modelModal, setModelModal] = useState<{
    open: boolean;
    keyId: string | null;
    data: Partial<AiProviderKeyModel> | null;
  }>({
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

  const [nowTs] = useState(() => Date.now());

  const stats = useMemo(() => {
    if (!bundle)
      return { totalKeys: 0, healthyKeys: 0, totalModels: 0, totalProviders: 0 };
    const totalKeys = bundle.keys.length;
    const healthyKeys = bundle.keys.filter((k) => {
      if (!k.is_enabled) return false;
      if (!k.unhealthy_until) return true;
      return new Date(k.unhealthy_until).getTime() <= nowTs;
    }).length;
    const uniqueModels = new Set(bundle.models.map((m) => m.model_id)).size;
    return {
      totalKeys,
      healthyKeys,
      totalModels: uniqueModels,
      totalProviders: bundle.providers.length,
    };
  }, [bundle, nowTs]);

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-36 rounded-2xl bg-[#FCFCFB] animate-pulse border border-[#E2E2DF]"
          />
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
    await mutateEntity("delete", deleteConfirm.entity, {
      id: deleteConfirm.id,
    });
    setDeleteConfirm({ open: false, entity: null, id: null, title: "" });
  };

  const handleTestKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    await testKeyConnection(keyId);
    setTestingKeyId(null);
  };

  return (
    <div className="space-y-5">
      {/* 算力健康态总览面板 */}
      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#FCFCFB]/90  select-none">
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#78716C]">服务商渠道</div>
          <Metric
            value={
              <>
                {stats.totalProviders}{" "}
                <span className="text-[12px] font-normal text-[#78716C]">个配置</span>
              </>
            }
          />
        </div>
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#78716C]">接入密钥池</div>
          <Metric
            value={
              <>
                {stats.totalKeys}{" "}
                <span className="text-[12px] font-normal text-[#78716C]">个 Key</span>
              </>
            }
          />
        </div>
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#78716C]">健康在线状态</div>
          <Metric
            tone="success"
            value={
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-current" />
                {stats.healthyKeys}{" "}
                <span className="text-[12px] font-normal text-[#78716C]">
                  / {stats.totalKeys} 在线
                </span>
              </span>
            }
          />
        </div>
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#78716C]">覆盖可用型号</div>
          <Metric
            value={
              <>
                {stats.totalModels}{" "}
                <span className="text-[12px] font-normal text-[#78716C]">个型号</span>
              </>
            }
          />
        </div>
      </Card>

      {/* 极简浅灰槽底单行 Header */}
      <div className="flex items-center justify-between bg-[#F1F1F0]/70 p-2.5 px-3.5 rounded-xl">
        <span className="text-[13px] font-normal text-[#141413]">
          第三方中转站 Base URL 与 API 密钥池
        </span>
        <Button
          size="sm"
          className="h-7 text-[12px] gap-1"
          onClick={() => setProviderModal({ open: true, data: null })}
        >
          <Plus className="size-3" /> 新建服务商渠道
        </Button>
      </div>

      {bundle.providers.length === 0 ? (
        <div className="rounded-2xl bg-[#FCFCFB]/70 p-12 text-center space-y-3">
          <Server className="size-8 text-[#78716C] mx-auto" />
          <EmptyState
            variant="compact"
            title="还没有供应商渠道。需要时可添加第三方中转站或 API 服务商。"
            action={{
              label: "添加首个渠道",
              onClick: () => setProviderModal({ open: true, data: null }),
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {bundle.providers.map((p) => {
            const providerKeys = bundle.keys.filter(
              (k) => k.provider_id === p.id,
            );

            return (
              <Card
                key={p.id}
                className="rounded-xl bg-[#FCFCFB]/40 overflow-hidden p-0 gap-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border-b border-[#E2E2DF]/60">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-xl bg-[#F1F1F0] flex items-center justify-center font-normal text-[13px] text-[#1F1E1D] border border-[#E2E2DF]">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-normal text-[#141413]">
                          {p.name}
                        </span>
                        {p.description && (
                          <span className="text-[12px] font-mono text-[#78716C] bg-[#F1F1F0] px-1.5 py-0.5 rounded-md">
                            {p.description}
                          </span>
                        )}
                        {!p.is_enabled && (
                          <span className="text-[12px] text-[#78716C] bg-[#F1F1F0] px-1.5 py-0.5 rounded-md">
                            已禁用
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#78716C] mt-0.5 truncate max-w-[320px]">
                        {p.base_url || "官方原生接口"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px]"
                      onClick={() =>
                        setKeyModal({ open: true, providerId: p.id, data: null })
                      }
                    >
                      <Plus className="size-3.5 mr-1" /> 新建 Key
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setProviderModal({ open: true, data: p })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[#78716C] hover:text-status-danger"
                      onClick={() =>
                        setDeleteConfirm({
                          open: true,
                          entity: "provider",
                          id: p.id,
                          title: p.name,
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="p-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#E2E2DF]/60">
                        <TableHead className="w-[180px]">
                          密钥标签
                        </TableHead>
                        <TableHead className="w-[120px]">
                          权重 / 槽位
                        </TableHead>
                        <TableHead className="w-[100px]">
                          健康态
                        </TableHead>
                        <TableHead className="w-[140px]">
                          可用模型数
                        </TableHead>
                        <TableHead>
                          最后调用状态
                        </TableHead>
                        <TableHead className="w-[120px] text-right">
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerKeys.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-6 text-[13px] text-[#78716C] border-0"
                          >
                            还没有 API 密钥分组，需要时点右上角新建
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
                        const keyModelsCount = bundle.models.filter(
                          (m) => m.key_id === keyItem.id,
                        ).length;

                        return (
                          <TableRow
                            key={keyItem.id}
                            className="hover:bg-[#F7F7F6] text-[13px] border-b border-[#E2E2DF]/60 last:border-b-0"
                          >
                            <TableCell className="pl-5 font-normal text-[#141413]">
                              <div className="flex items-center gap-1">
                                <Key className="size-3.5 text-[#78716C]" />
                                {keyItem.label}
                              </div>
                            </TableCell>

                            <TableCell className="font-mono text-[#78716C]">
                              {keyItem.api_key_masked || "***"}
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                {healthStatus === "healthy" ? (
                                  <Badge variant="success">正常</Badge>
                                ) : healthStatus === "untested" ? (
                                  <Badge variant="neutral">未测试</Badge>
                                ) : healthStatus === "disabled" ? (
                                  <Badge variant="neutral">已停用</Badge>
                                ) : (
                                  <Badge variant="danger" title={keyItem.last_error_message || undefined}>
                                    异常/离线
                                  </Badge>
                                )}

                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-[#1F1E1D] hover:text-[#D97757]"
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

                            <TableCell className="text-[#78716C]">
                              {keyModelsCount} 个模型
                            </TableCell>

                            <TableCell>
                              <Switch
                                aria-label={`启用分组 ${keyItem.label}`}
                                className="scale-75 origin-left"
                                checked={keyItem.is_enabled}
                                onCheckedChange={(checked) =>
                                  mutateEntity("update", "key", {
                                    id: keyItem.id,
                                    is_enabled: checked,
                                  })
                                }
                              />
                            </TableCell>

                            <TableCell className="text-right pr-5">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-[#78716C] hover:text-[#D97757]"
                                  onClick={() =>
                                    setModelModal({
                                      open: true,
                                      keyId: keyItem.id,
                                      data: null,
                                    })
                                  }
                                  title="管理此 Key 关联的模型"
                                >
                                  <Tag className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-[#78716C] hover:text-[#1F1E1D]"
                                  onClick={() =>
                                    setKeyModal({
                                      open: true,
                                      providerId: p.id,
                                      data: keyItem,
                                    })
                                  }
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-[#78716C] hover:text-status-danger"
                                  onClick={() =>
                                    setDeleteConfirm({
                                      open: true,
                                      entity: "key",
                                      id: keyItem.id,
                                      title: `删除密钥分组 ${keyItem.label}`,
                                    })
                                  }
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
              </Card>
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
