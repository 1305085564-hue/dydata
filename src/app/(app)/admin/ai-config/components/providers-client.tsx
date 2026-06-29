"use client";

import { useState } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { ChevronDown, ChevronRight, Server, Key as KeyIcon, Box, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProviderDialog, KeyDialog, ModelDialog } from "./providers-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function ProvidersClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

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
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">供应商管理</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setProviderModal({ open: true, data: null })}>
          <Plus className="size-4" /> 添加供应商
        </Button>
      </div>

      <div className="space-y-3">
        {bundle.providers.map((provider) => {
          const isExpanded = expandedProviders[provider.id] !== false; // default true
          const providerKeys = bundle.keys.filter((k) => k.provider_id === provider.id);

          return (
            <div key={provider.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                onClick={() => toggleProvider(provider.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                    <Server className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-800">{provider.name}</span>
                      {!provider.is_enabled && <Badge variant="outline" className="text-[10px] h-5">已停用</Badge>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{provider.base_url}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-8 text-zinc-400 hover:text-zinc-600" onClick={(e) => { e.stopPropagation(); setProviderModal({ open: true, data: provider }); }}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-zinc-400 hover:text-[#D97757]" onClick={(e) => { e.stopPropagation(); setKeyModal({ open: true, providerId: provider.id, data: null }); }}>
                    <Plus className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-zinc-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, entity: "provider", id: provider.id, title: `删除供应商 ${provider.name}` }); }}>
                    <Trash2 className="size-4" />
                  </Button>
                  {isExpanded ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-100 bg-zinc-50/50 p-4 pl-14 space-y-3">
                  {providerKeys.length === 0 ? (
                    <div className="text-xs text-zinc-400 py-2">暂无 Key，请添加</div>
                  ) : (
                    providerKeys.map((apiKey) => {
                      const isKeyExp = expandedKeys[apiKey.id] !== false;
                      const keyModels = bundle.models.filter((m) => m.key_id === apiKey.id);
                      const healthy = isKeyHealthy(apiKey);

                      return (
                        <div key={apiKey.id} className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-50 transition-colors"
                            onClick={() => toggleKey(apiKey.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("flex size-7 items-center justify-center rounded-md text-white", healthy ? "bg-emerald-500" : "bg-rose-500")}>
                                <KeyIcon className="size-3.5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-zinc-800">{apiKey.label}</span>
                                  {healthy ? (
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 text-[10px] h-5 border-emerald-200">正常</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-rose-50 text-rose-600 hover:bg-rose-50 text-[10px] h-5 border-rose-200">异常或停用</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-500 mt-0.5 font-mono">{apiKey.api_key_masked || "***"}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="size-7 text-zinc-400 hover:text-zinc-600" onClick={(e) => { e.stopPropagation(); setKeyModal({ open: true, providerId: provider.id, data: apiKey }); }}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-7 text-zinc-400 hover:text-[#D97757]" onClick={(e) => { e.stopPropagation(); setModelModal({ open: true, keyId: apiKey.id, data: null }); }}>
                                <Plus className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-7 text-zinc-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, entity: "key", id: apiKey.id, title: `删除 API Key ${apiKey.label}` }); }}>
                                <Trash2 className="size-3.5" />
                              </Button>
                              {isKeyExp ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
                            </div>
                          </div>

                          {isKeyExp && (
                            <div className="border-t border-zinc-100 bg-zinc-50 p-3 pl-12 space-y-2">
                              {keyModels.length === 0 ? (
                                <div className="text-xs text-zinc-400 py-1">暂无可用模型，请添加</div>
                              ) : (
                                keyModels.map((model) => (
                                  <div key={model.id} className="flex items-center justify-between p-2 rounded-md border border-zinc-100 bg-white">
                                    <div className="flex items-center gap-2">
                                      <Box className="size-3.5 text-zinc-400" />
                                      <span className="text-xs font-medium text-zinc-700">{model.display_name || model.model_id}</span>
                                      {!model.is_enabled && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0">已停用</Badge>}
                                    </div>
                                    <div className="flex items-center">
                                      <Button variant="ghost" size="icon" className="size-6 text-zinc-400 hover:text-zinc-600" onClick={(e) => { e.stopPropagation(); setModelModal({ open: true, keyId: apiKey.id, data: model }); }}>
                                        <Pencil className="size-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="size-6 text-zinc-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, entity: "model", id: model.id, title: `删除模型 ${model.display_name || model.model_id}` }); }}>
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
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

      <ProviderDialog open={providerModal.open} provider={providerModal.data} onOpenChange={(c) => setProviderModal({ ...providerModal, open: c })} onSave={handleSaveProvider} />
      <KeyDialog open={keyModal.open} apiKey={keyModal.data} providerId={keyModal.providerId} onOpenChange={(c) => setKeyModal({ ...keyModal, open: c })} onSave={handleSaveKey} />
      <ModelDialog open={modelModal.open} model={modelModal.data} keyId={modelModal.keyId} onOpenChange={(c) => setModelModal({ ...modelModal, open: c })} onSave={handleSaveModel} />
      <ConfirmDialog open={deleteConfirm.open} title={deleteConfirm.title} description="此操作无法撤销，确定要删除吗？" confirmText="删除" cancelText="取消" onConfirm={handleDelete} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} />
    </div>
  );
}
