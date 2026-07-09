"use client";

import { useState } from "react";
import { AiFeatureBinding, useAiConfig } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus } from "lucide-react";
import { BindingDialog } from "./bindings-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function BindingsClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [bindingModal, setBindingModal] = useState<{ open: boolean; data: Partial<AiFeatureBinding> | null }>({ open: false, data: null });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null; title: string }>({ open: false, id: null, title: "" });

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        <div className="h-40 rounded-2xl bg-stone-50 animate-pulse border border-stone-200" />
      </div>
    );
  }

  const getModelName = (providerKeyModelId: string | null) => {
    if (!providerKeyModelId) return "自动分配 (Failover)";
      const model = bundle.models.find(m => m.id === providerKeyModelId);
      if (!model) return "未知模型";
    const key = bundle.keys.find(k => k.id === model.key_id);
    const provider = bundle.providers.find(p => p.id === key?.provider_id);
    return `${provider?.name || "未知"} / ${key?.label || "未知"} / ${model.display_name || model.model_id}`;
  };

  const handleSaveBinding = async (data: Record<string, unknown>) => {
    const action = bindingModal.data?.id ? "update" : "create";
    if (action === "update") data.id = bindingModal.data?.id;
    const ok = await mutateEntity(action, "feature_binding", data);
    if (ok) setBindingModal({ open: false, data: null });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    await mutateEntity("delete", "feature_binding", { id: deleteConfirm.id });
    setDeleteConfirm({ open: false, id: null, title: "" });
  };

  const toggleStatus = async (binding: AiFeatureBinding, enabled: boolean) => {
    await mutateEntity("update", "feature_binding", { id: binding.id, is_enabled: enabled });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-stone-800">业务功能绑定</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setBindingModal({ open: true, data: null })}>
          <Plus className="size-4" /> 添加绑定
        </Button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-stone-50/50">
            <TableRow>
              <TableHead className="w-[180px]">功能标识</TableHead>
              <TableHead className="w-[200px]">功能名称</TableHead>
              <TableHead>绑定模型</TableHead>
              <TableHead className="w-[120px]">上下文/输出</TableHead>
              <TableHead className="w-[100px]">状态</TableHead>
              <TableHead className="w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.featureBindings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-stone-500">
                  暂无功能绑定
                </TableCell>
              </TableRow>
            ) : (
              bundle.featureBindings.map((binding) => (
                <TableRow key={binding.id}>
                  <TableCell className="font-mono text-xs text-stone-600">
                    {binding.feature_key}
                  </TableCell>
                  <TableCell className="font-medium text-stone-800">
                    {binding.label}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-stone-600 bg-stone-50">
                      {getModelName(binding.provider_key_model_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-stone-500">
                    {binding.context_message_limit} 轮 / {binding.output_token_limit} tk
                  </TableCell>
                  <TableCell>
                    <Switch checked={binding.is_enabled} onCheckedChange={(c) => toggleStatus(binding, c)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-8 text-stone-400 hover:text-stone-600" onClick={() => setBindingModal({ open: true, data: binding })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-stone-400 hover:text-rose-600" onClick={() => setDeleteConfirm({ open: true, id: binding.id, title: `删除功能绑定 ${binding.label}` })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BindingDialog open={bindingModal.open} binding={bindingModal.data} onOpenChange={(c) => setBindingModal({ ...bindingModal, open: c })} onSave={handleSaveBinding} />
      <ConfirmDialog open={deleteConfirm.open} title={deleteConfirm.title} description="此操作无法撤销，确定要删除吗？" confirmText="删除" cancelText="取消" onConfirm={handleDelete} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} />
    </div>
  );
}
