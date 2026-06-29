"use client";

import { useState, useEffect } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { ChevronDown, ChevronRight, Server, Key as KeyIcon, Box, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProviderDialog, KeyDialog, ModelDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProvidersClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  type ActiveNode = { type: "provider" | "key"; id: string };
  const [activeNode, setActiveNode] = useState<ActiveNode | null>(null);

  useEffect(() => {
    if (bundle && bundle.providers.length > 0 && !activeNode) {
      setActiveNode({ type: "provider", id: bundle.providers[0].id });
    }
  }, [bundle, activeNode]);

  useEffect(() => {
    if (!bundle) return;
    if (activeNode) {
      if (activeNode.type === "provider") {
        const exists = bundle.providers.some(p => p.id === activeNode.id);
        if (!exists && bundle.providers.length > 0) {
          setActiveNode({ type: "provider", id: bundle.providers[0].id });
        }
      } else if (activeNode.type === "key") {
        const exists = bundle.keys.some(k => k.id === activeNode.id);
        if (!exists && bundle.providers.length > 0) {
          setActiveNode({ type: "provider", id: bundle.providers[0].id });
        }
      }
    }
  }, [bundle, activeNode]);

  const [providerModal, setProviderModal] = useState<{ open: boolean; data: Partial<AiProvider> | null }>({ open: false, data: null });
  const [keyModal, setKeyModal] = useState<{ open: boolean; providerId: string | null; data: Partial<AiProviderKey> | null }>({ open: false, providerId: null, data: null });
  const [modelModal, setModelModal] = useState<{ open: boolean; keyId: string | null; data: Partial<AiProviderKeyModel> | null }>({ open: false, keyId: null, data: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; entity: "provider" | "key" | "model" | null; id: string | null; title: string }>({ open: false, entity: null, id: null, title: "" });

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-zinc-50 animate-pulse border border-zinc-200" />
        ))}
      </div>
    );
  }

  const toggleProvider = (id: string) => setExpandedProviders((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleKey = (id: string) => setExpandedKeys((prev) => ({ ...prev, [id]: !prev[id] }));

  const isKeyHealthy = (key: AiProviderKey) => {
    if (!key.is_enabled) return false;
    if (key.unhealthy_until && new Date(key.unhealthy_until).getTime() > Date.now()) {
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
      <div className="w-full md:w-[280px] border border-zinc-200 rounded-2xl bg-white p-3 shadow-sm space-y-3 shrink-0">
        <div className="flex justify-between items-center px-2 py-1">
          <h2 className="text-[12px] font-semibold text-zinc-400 tracking-wider">渠道与分组</h2>
          <Button variant="ghost" size="icon" className="size-6 text-zinc-400 hover:text-zinc-700 rounded-md bg-zinc-50 hover:bg-zinc-100" onClick={() => setProviderModal({ open: true, data: null })}>
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
                    "group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all text-[13px] relative",
                    isProviderActive 
                      ? "bg-zinc-100/80 text-zinc-900 font-medium" 
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                  onClick={() => setActiveNode({ type: "provider", id: p.id })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="flex items-center justify-center size-5 rounded-md hover:bg-zinc-200/50 text-zinc-400 transition-colors shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProvider(p.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown strokeWidth={2} className="size-3.5" />
                      ) : (
                        <ChevronRight strokeWidth={2} className="size-3.5" />
                      )}
                    </div>
                    <span className="truncate">{p.name}</span>
                    {!p.is_enabled && (
                      <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1 rounded-sm">停用</span>
                    )}
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0 pr-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="size-5 text-zinc-400 hover:text-zinc-700" 
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
                      <div className="text-xs text-zinc-400 py-1 pl-2">无分组</div>
                    ) : (
                      pKeys.map((key) => {
                        const isKeyActive = activeNode?.type === "key" && activeNode?.id === key.id;
                        const healthy = isKeyHealthy(key);

                        return (
                          <div 
                            key={key.id}
                            className={cn(
                              "group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all text-[13px]",
                              isKeyActive 
                                ? "bg-[#8AA8C7]/10 text-zinc-900 font-medium" 
                                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                            )}
                            onClick={() => setActiveNode({ type: "key", id: key.id })}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {/* 极简健康状态点 */}
                              <span className={cn("size-1.5 rounded-full shrink-0 shadow-sm", healthy ? "bg-emerald-500" : "bg-rose-500")} />
                              <span className="truncate">{key.label}</span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0 pr-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="size-5 text-zinc-400 hover:text-zinc-700"
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
      <div className="flex-1 border border-zinc-200 rounded-2xl bg-white p-6 shadow-sm min-h-[480px] min-w-0">
        {activeNode?.type === "provider" && (() => {
          const provider = bundle.providers.find((p) => p.id === activeNode.id);
          if (!provider) return <div className="text-zinc-400 text-xs py-10 text-center">渠道已不存在</div>;
          const providerKeys = bundle.keys.filter((k) => k.provider_id === provider.id);

          return (
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="font-semibold text-[16px] leading-[1.5] text-zinc-800">{provider.name}</h3>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">{provider.base_url}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                    <span>{provider.is_enabled ? "已启用" : "已禁用"}</span>
                    <Switch 
                      className="scale-75"
                      checked={provider.is_enabled} 
                      onCheckedChange={(checked) => mutateEntity("update", "provider", { id: provider.id, is_enabled: checked })} 
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setProviderModal({ open: true, data: provider })}>
                    <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setKeyModal({ open: true, providerId: provider.id, data: null })}>
                    <Plus strokeWidth={1.5} className="size-3 mr-1" /> 新建分组
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">绑定的 API 分组</h4>
                <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-zinc-50/50">
                      <TableRow>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 pl-3 text-left">分组名称</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-left">API Key</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-left">健康状态</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-left w-[85px]">启用</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-right w-[100px] pr-3">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerKeys.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-[13px] py-8 text-zinc-450">
                            暂无 API 分组，请点击新建分组
                          </TableCell>
                        </TableRow>
                      ) : (
                        providerKeys.map((key) => {
                          const healthy = isKeyHealthy(key);
                          return (
                            <TableRow key={key.id} className="group hover:bg-zinc-50/50 h-9 transition-colors">
                              <TableCell className="py-1 text-[13px] font-medium text-zinc-800 pl-3 text-left">{key.label}</TableCell>
                              <TableCell className="py-1 text-[13px] font-mono text-zinc-400 text-left">{key.api_key_masked || "***"}</TableCell>
                              <TableCell className="py-1 text-left">
                                {healthy ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/5 text-emerald-700 border border-emerald-500/10">
                                    <span className="size-1 rounded-full bg-emerald-500" />
                                    正常
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/5 text-rose-700 border border-rose-500/10">
                                    <span className="size-1 rounded-full bg-rose-500" />
                                    异常/停用
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-1 text-left">
                                <Switch 
                                  className="scale-75 origin-left"
                                  checked={key.is_enabled} 
                                  onCheckedChange={(checked) => mutateEntity("update", "key", { id: key.id, is_enabled: checked })} 
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right pr-3">
                                <div className="flex items-center justify-end relative h-7">
                                  <div className="absolute right-1.5 opacity-30 group-hover:opacity-0 transition-opacity">
                                    <span className="text-zinc-400 text-[10px] tracking-widest font-bold">···</span>
                                  </div>
                                  <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="size-7 text-zinc-400 hover:text-zinc-600" 
                                      onClick={() => setKeyModal({ open: true, providerId: provider.id, data: key })}
                                    >
                                      <Pencil strokeWidth={1.5} className="size-3" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="size-7 text-zinc-400 hover:text-[#D97757]" 
                                      onClick={() => setModelModal({ open: true, keyId: key.id, data: null })}
                                    >
                                      <Plus strokeWidth={1.5} className="size-3" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="size-7 text-zinc-400 hover:text-rose-600" 
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
          if (!apiKey) return <div className="text-zinc-400 text-[13px] py-10 text-center">分组已不存在</div>;
          const provider = bundle.providers.find((p) => p.id === apiKey.provider_id);
          const keyModels = bundle.models.filter((m) => m.key_id === apiKey.id);

          return (
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="font-semibold text-[16px] leading-[1.5] text-zinc-800">{apiKey.label} 分组</h3>
                  <div className="text-[12px] text-zinc-400 mt-1">
                    所属渠道：{provider?.name || "未知"} | Key：<span className="font-mono">{apiKey.api_key_masked}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                    <span>{apiKey.is_enabled ? "已启用" : "已禁用"}</span>
                    <Switch 
                      className="scale-75"
                      checked={apiKey.is_enabled} 
                      onCheckedChange={(checked) => mutateEntity("update", "key", { id: apiKey.id, is_enabled: checked })} 
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setKeyModal({ open: true, providerId: apiKey.provider_id, data: apiKey })}>
                    <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑分组
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setModelModal({ open: true, keyId: apiKey.id, data: null })}>
                    <Plus strokeWidth={1.5} className="size-3 mr-1" /> 添加模型
                  </Button>
                </div>
              </div>

              {/* 诊断小栏 */}
              <div className="grid grid-cols-2 gap-4 bg-zinc-50/50 p-3 rounded-lg border border-zinc-100 text-[12px]">
                <div>
                  <span className="text-zinc-500">连续失败次数：</span>
                  <span className={cn("font-semibold", apiKey.consecutive_failures > 0 ? "text-rose-600" : "text-zinc-600")}>
                    {apiKey.consecutive_failures}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">最近成功时间：</span>
                  <span className="text-zinc-600 font-medium">
                    {apiKey.last_success_at ? new Date(apiKey.last_success_at).toLocaleString() : "暂无"}
                  </span>
                </div>
                {apiKey.last_error_message && (
                  <div className="col-span-2 text-rose-500 border-t border-zinc-100 pt-1.5 mt-0.5">
                    <span className="font-bold text-[10px] uppercase tracking-wider">最近异常：</span>
                    {apiKey.last_error_message}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">支持的可用模型列表</h4>
                <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-zinc-50/50">
                      <TableRow>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 pl-3 text-left">模型标识 (ID)</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-left">友好显示名称</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-left w-[85px]">启用</TableHead>
                        <TableHead className="text-[12px] font-medium text-zinc-450 h-8 py-1.5 text-right w-[100px] pr-3">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyModels.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-[13px] py-8 text-zinc-400">
                            暂无可用模型，请点击右上角添加
                          </TableCell>
                        </TableRow>
                      ) : (
                        keyModels.map((model) => (
                          <TableRow key={model.id} className="group hover:bg-zinc-50/50 h-9 transition-colors">
                            <TableCell className="py-1 text-xs font-mono text-zinc-600 pl-3 text-left">{model.model_id}</TableCell>
                            <TableCell className="py-1 text-[13px] font-medium text-zinc-800 text-left">{model.display_name || model.model_id}</TableCell>
                            <TableCell className="py-1 text-left">
                              <Switch 
                                className="scale-75 origin-left"
                                checked={model.is_enabled} 
                                onCheckedChange={(checked) => mutateEntity("update", "model", { id: model.id, is_enabled: checked })} 
                              />
                            </TableCell>
                            <TableCell className="py-1 text-right pr-3">
                              <div className="flex items-center justify-end relative h-7">
                                <div className="absolute right-1.5 opacity-30 group-hover:opacity-0 transition-opacity">
                                  <span className="text-zinc-400 text-[10px] tracking-widest font-bold">···</span>
                                </div>
                                <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="size-7 text-zinc-400 hover:text-zinc-600" 
                                    onClick={() => setModelModal({ open: true, keyId: apiKey.id, data: model })}
                                  >
                                    <Pencil strokeWidth={1.5} className="size-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="size-7 text-zinc-400 hover:text-rose-600" 
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
          <div className="text-center py-20 text-[13px] text-zinc-400">
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
