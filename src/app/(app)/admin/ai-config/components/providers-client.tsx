"use client";

import { useMemo, useState } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProviderDialog, KeyDialog, ModelDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProvidersClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  type ActiveNode = { type: "provider" | "key"; id: string };
  const [selectedNode, setSelectedNode] = useState<ActiveNode | null>(null);
  const activeNode = useMemo<ActiveNode | null>(() => {
    if (!bundle) return selectedNode;
    if (selectedNode?.type === "provider" && bundle.providers.some((provider) => provider.id === selectedNode.id)) {
      return selectedNode;
    }
    if (selectedNode?.type === "key" && bundle.keys.some((key) => key.id === selectedNode.id)) {
      return selectedNode;
    }
    const firstProvider = bundle.providers[0];
    return firstProvider ? { type: "provider", id: firstProvider.id } : null;
  }, [bundle, selectedNode]);
  const [healthCheckTime] = useState(() => Date.now());

  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({ open: false, data: null });
  const [keyModal, setKeyModal] = useState<{ open: boolean; providerId: string | null; data: Partial<AiProviderKey> | null }>({ open: false, providerId: null, data: null });
  const [modelModal, setModelModal] = useState<{ open: boolean; keyId: string | null; data: Partial<AiProviderKeyModel> | null }>({ open: false, keyId: null, data: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; entity: "provider" | "key" | "model" | null; id: string | null; title: string }>({ open: false, entity: null, id: null, title: "" });

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-stone-50 animate-pulse border border-stone-200" />
        ))}
      </div>
    );
  }

  const toggleProvider = (id: string) => setExpandedProviders((prev) => ({
    ...prev,
    [id]: !(prev[id] !== false),
  }));

  const isKeyHealthy = (key: AiProviderKey) => {
    if (!key.is_enabled) return false;
    if (key.unhealthy_until && new Date(key.unhealthy_until).getTime() > healthCheckTime) {
      return false;
    }
    return true;
  };

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

  return (
    <div className="flex flex-col md:flex-row gap-3 items-start min-h-[580px]">
      {/* 左栏：极简白底卡片树导航 */}
      <div className="w-full md:w-[280px] border border-stone-200 rounded-2xl bg-white p-3 space-y-3 shrink-0">
        <div className="flex justify-between items-center px-2 py-1">
          <h2 className="text-[12px] font-normal text-stone-500 tracking-wider">渠道与分组</h2>
          <Button variant="ghost" size="icon" aria-label="新建渠道" className="size-6 text-stone-500 hover:text-stone-700 rounded-md bg-stone-50 hover:bg-stone-100" onClick={() => setProviderModal({ open: true, data: null })}>
            <Plus strokeWidth={2} className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1">
          {bundle.providers.map((p) => {
            const isProviderActive = activeNode?.type === "provider" && activeNode?.id === p.id;
            const pKeys = bundle.keys.filter((k) => k.provider_id === p.id);
            const isExpanded = expandedProviders[p.id] !== false;

            return (
              <div key={p.id} className="space-y-0.5">
                {/* 渠道节点 (顶级) */}
                <div
                  className={cn(
                    "group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all text-[13px] relative",
                    isProviderActive
                      ? "bg-stone-100/80 text-stone-900 font-medium"
                      : "text-stone-700 hover:bg-stone-50 hover:text-stone-900"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`${isExpanded ? "收起" : "展开"}渠道 ${p.name}`}
                      aria-expanded={isExpanded}
                      className="flex items-center justify-center size-5 rounded-md hover:bg-stone-200/50 text-stone-500 transition-colors shrink-0"
                      onClick={() => toggleProvider(p.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown strokeWidth={2} className="size-3.5" />
                      ) : (
                        <ChevronRight strokeWidth={2} className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-current={isProviderActive ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
                      onClick={() => setSelectedNode({ type: "provider", id: p.id })}
                    >
                      <span className="truncate">{p.name}</span>
                      {!p.is_enabled && (
                        <span className="text-[12px] text-stone-500 bg-stone-100 px-1 rounded-sm">停用</span>
                      )}
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pr-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`编辑渠道 ${p.name}`}
                      className="size-5 text-stone-500 hover:text-stone-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProviderModal({ open: true, data: p });
                      }}
                    >
                      <Pencil strokeWidth={1.5} className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* 分组节点 (次级) */}
                {isExpanded && (
                  <div className="pl-[28px] space-y-0.5 pb-1">
                    {pKeys.length === 0 ? (
                      <div className="text-[12px] text-stone-500 py-1 pl-2">无分组</div>
                    ) : (
                      pKeys.map((key) => {
                        const isKeyActive = activeNode?.type === "key" && activeNode?.id === key.id;
                        const healthy = isKeyHealthy(key);

                        return (
                          <div
                            key={key.id}
                            className={cn(
                              "group flex items-center justify-between px-2 py-1.5 rounded-md transition-all text-[13px]",
                              isKeyActive
                                ? "bg-[#5F82A8]/10 text-stone-900 font-medium"
                                : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
                            )}
                          >
                            <button
                              type="button"
                              aria-current={isKeyActive ? "true" : undefined}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
                              onClick={() => setSelectedNode({ type: "key", id: key.id })}
                            >
                              {/* 极简健康状态点 */}
                              <span className={cn("size-1.5 rounded-full shrink-0", healthy ? "bg-[#6FAA7D]" : "bg-[#C9604D]")} />
                              <span className="truncate">{key.label}</span>
                            </button>
                            <div className="flex shrink-0 items-center gap-1 pr-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`编辑分组 ${key.label}`}
                                className="size-5 text-stone-500 hover:text-stone-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setKeyModal({ open: true, providerId: p.id, data: key });
                                }}
                              >
                                <Pencil strokeWidth={1.5} className="size-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 右栏：独立白底配置卡片 */}
      <div className="flex-1 border border-stone-200 rounded-2xl bg-white p-6 min-h-[480px] min-w-0">
        {activeNode?.type === "provider" && (() => {
          const provider = bundle.providers.find((p) => p.id === activeNode.id);
          if (!provider) return <div className="text-stone-500 text-[12px] py-10 text-center">渠道已不存在</div>;
          const providerKeys = bundle.keys.filter((k) => k.provider_id === provider.id);

          return (
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <div>
                  <h3 className="font-medium text-[13px] leading-[1.5] text-stone-900">{provider.name}</h3>
                  <div className="text-[12px] text-stone-500 mt-1 font-mono">{provider.base_url}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">
                    <span>{provider.is_enabled ? "已启用" : "已禁用"}</span>
                    <Switch
                      aria-label={`启用渠道 ${provider.name}`}
                      className="scale-75"
                      checked={provider.is_enabled}
                      onCheckedChange={(checked) => mutateEntity("update", "provider", { id: provider.id, is_enabled: checked })}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setProviderModal({ open: true, data: provider })}>
                    <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑
                  </Button>
                  <Button size="sm" className="h-7 text-[12px]" onClick={() => setKeyModal({ open: true, providerId: provider.id, data: null })}>
                    <Plus strokeWidth={1.5} className="size-3 mr-1" /> 新建分组
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[12px] font-normal text-stone-500 uppercase tracking-wider">绑定的 API 分组</h4>
                <div className="rounded-lg border border-stone-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-stone-50/50">
                      <TableRow>
                        <TableHead className="h-8 py-1.5 pl-3 text-left text-[12px] font-normal text-stone-500">分组名称</TableHead>
                        <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-stone-500">API Key</TableHead>
                        <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-stone-500">健康状态</TableHead>
                        <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-stone-500">启用</TableHead>
                        <TableHead className="h-8 w-[100px] py-1.5 pr-3 text-right text-[12px] font-normal text-stone-500">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerKeys.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-[13px] text-stone-500">
                            暂无 API 分组，请点击新建分组
                          </TableCell>
                        </TableRow>
                      ) : (
                        providerKeys.map((key) => {
                          const healthy = isKeyHealthy(key);
                          return (
                            <TableRow key={key.id} className="group hover:bg-stone-50/50 h-9 transition-colors">
                              <TableCell className="py-1 text-[13px] font-medium text-stone-900 pl-3 text-left">{key.label}</TableCell>
                              <TableCell className="py-1 text-[13px] font-mono text-stone-500 text-left">{key.api_key_masked || "***"}</TableCell>
                              <TableCell className="py-1 text-left">
                                {healthy ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-[#6FAA7D]/100/5 text-[#6FAA7D] border border-[#6FAA7D]/10">
                                    <span className="size-1 rounded-full bg-[#6FAA7D]/100" />
                                    正常
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] font-medium bg-[#C9604D]/5 text-[#C9604D] border border-[#C9604D]/10">
                                    <span className="size-1 rounded-full bg-[#C9604D]" />
                                    异常/停用
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-1 text-left">
                                <Switch
                                  aria-label={`启用分组 ${key.label}`}
                                  className="scale-75 origin-left"
                                  checked={key.is_enabled}
                                  onCheckedChange={(checked) => mutateEntity("update", "key", { id: key.id, is_enabled: checked })}
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right pr-3">
                                <div className="flex items-center justify-end relative h-7">
                                  <div className="absolute right-1.5 opacity-0 transition-opacity sm:opacity-30 sm:group-hover:opacity-0 sm:group-focus-within:opacity-0">
                                    <span className="text-stone-500 text-[12px] tracking-widest font-normal">···</span>
                                  </div>
                                  <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`编辑分组 ${key.label}`}
                                      className="size-7 text-stone-500 hover:text-stone-700"
                                      onClick={() => setKeyModal({ open: true, providerId: provider.id, data: key })}
                                    >
                                      <Pencil strokeWidth={1.5} className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`为分组 ${key.label} 添加模型`}
                                      className="size-7 text-stone-500 hover:text-[#D97757]"
                                      onClick={() => setModelModal({ open: true, keyId: key.id, data: null })}
                                    >
                                      <Plus strokeWidth={1.5} className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`删除分组 ${key.label}`}
                                      className="size-7 text-stone-500 hover:text-[#C9604D]"
                                      onClick={() => setDeleteConfirm({ open: true, entity: "key", id: key.id, title: `删除分组 ${key.label}` })}
                                    >
                                      <Trash2 strokeWidth={1.5} className="size-3" />
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          );
        })()}

        {activeNode?.type === "key" && (() => {
          const apiKey = bundle.keys.find((k) => k.id === activeNode.id);
          if (!apiKey) return <div className="text-stone-500 text-[13px] py-10 text-center">分组已不存在</div>;
          const provider = bundle.providers.find((p) => p.id === apiKey.provider_id);
          const keyModels = bundle.models.filter((m) => m.key_id === apiKey.id);

          return (
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <div>
                  <h3 className="font-medium text-[13px] leading-[1.5] text-stone-900">{apiKey.label} 分组</h3>
                  <div className="text-[12px] text-stone-500 mt-1">
                    所属渠道：{provider?.name || "未知"} | Key：<span className="font-mono">{apiKey.api_key_masked}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">
                    <span>{apiKey.is_enabled ? "已启用" : "已禁用"}</span>
                    <Switch
                      aria-label={`启用分组 ${apiKey.label}`}
                      className="scale-75"
                      checked={apiKey.is_enabled}
                      onCheckedChange={(checked) => mutateEntity("update", "key", { id: apiKey.id, is_enabled: checked })}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setKeyModal({ open: true, providerId: apiKey.provider_id, data: apiKey })}>
                    <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑分组
                  </Button>
                  <Button size="sm" className="h-7 text-[12px]" onClick={() => setModelModal({ open: true, keyId: apiKey.id, data: null })}>
                    <Plus strokeWidth={1.5} className="size-3 mr-1" /> 添加模型
                  </Button>
                </div>
              </div>

              {/* 诊断小栏 */}
              <div className="grid grid-cols-2 gap-4 bg-stone-50/50 p-3 rounded-lg border border-stone-100 text-[12px]">
                <div>
                  <span className="text-stone-500">连续失败次数：</span>
                  <span className={cn("font-medium", apiKey.consecutive_failures > 0 ? "text-[#C9604D]" : "text-stone-700")}>
                    {apiKey.consecutive_failures}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500">最近成功时间：</span>
                  <span className="text-stone-700 font-medium">
                    {apiKey.last_success_at ? new Date(apiKey.last_success_at).toLocaleString() : "暂无"}
                  </span>
                </div>
                {apiKey.last_error_message && (
                  <div className="col-span-2 text-[#C9604D] border-t border-stone-100 pt-1.5 mt-0.5">
                    <span className="font-medium text-[12px] uppercase tracking-wider">最近异常：</span>
                    {apiKey.last_error_message}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-[12px] font-normal text-stone-500 uppercase tracking-wider">支持的可用模型列表</h4>
                <div className="rounded-lg border border-stone-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-stone-50/50">
                      <TableRow>
                        <TableHead className="h-8 py-1.5 pl-3 text-left text-[12px] font-normal text-stone-500">模型标识 (ID)</TableHead>
                        <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-stone-500">友好显示名称</TableHead>
                        <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-stone-500">启用</TableHead>
                        <TableHead className="h-8 w-[100px] py-1.5 pr-3 text-right text-[12px] font-normal text-stone-500">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyModels.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-[13px] py-8 text-stone-500">
                            暂无可用模型，请点击右上角添加
                          </TableCell>
                        </TableRow>
                      ) : (
                        keyModels.map((model) => (
                          <TableRow key={model.id} className="group hover:bg-stone-50/50 h-9 transition-colors">
                            <TableCell className="py-1 text-[12px] font-mono text-stone-700 pl-3 text-left">{model.model_id}</TableCell>
                            <TableCell className="py-1 text-[13px] font-medium text-stone-900 text-left">{model.display_name || model.model_id}</TableCell>
                            <TableCell className="py-1 text-left">
                              <Switch
                                aria-label={`启用模型 ${model.display_name || model.model_id}`}
                                className="scale-75 origin-left"
                                checked={model.is_enabled}
                                onCheckedChange={(checked) => mutateEntity("update", "model", { id: model.id, is_enabled: checked })}
                              />
                            </TableCell>
                            <TableCell className="py-1 text-right pr-3">
                              <div className="flex items-center justify-end relative h-7">
                                <div className="absolute right-1.5 opacity-0 transition-opacity sm:opacity-30 sm:group-hover:opacity-0 sm:group-focus-within:opacity-0">
                                  <span className="text-stone-500 text-[12px] tracking-widest font-normal">···</span>
                                </div>
                                <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`编辑模型 ${model.display_name || model.model_id}`}
                                    className="size-7 text-stone-500 hover:text-stone-700"
                                    onClick={() => setModelModal({ open: true, keyId: apiKey.id, data: model })}
                                  >
                                    <Pencil strokeWidth={1.5} className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`删除模型 ${model.display_name || model.model_id}`}
                                    className="size-7 text-stone-500 hover:text-[#C9604D]"
                                    onClick={() => setDeleteConfirm({ open: true, entity: "model", id: model.id, title: `删除模型 ${model.display_name || model.model_id}` })}
                                  >
                                    <Trash2 strokeWidth={1.5} className="size-3" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          );
        })()}

        {!activeNode && (
          <div className="text-center py-20 text-[13px] text-stone-500">
            请在左侧树中选择渠道或分组以查看详情
          </div>
        )}
      </div>

      <ProviderDialog open={providerModal.open} provider={providerModal.data} onOpenChange={(c) => setProviderModal({ ...providerModal, open: c })} onSave={handleSaveProvider} />
      <KeyDialog open={keyModal.open} apiKey={keyModal.data} providerId={keyModal.providerId} onOpenChange={(c) => setKeyModal({ ...keyModal, open: c })} onSave={handleSaveKey} />
      <ModelDialog open={modelModal.open} model={modelModal.data} keyId={modelModal.keyId} onOpenChange={(c) => setModelModal({ ...modelModal, open: c })} onSave={handleSaveModel} />
      <ConfirmDialog open={deleteConfirm.open} title={deleteConfirm.title} description="此操作无法撤销，确定要删除吗？" confirmText="删除" cancelText="取消" onConfirm={handleDelete} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} />
    </div>
  );
}
