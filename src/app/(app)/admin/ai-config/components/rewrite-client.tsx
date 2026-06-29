"use client";

import { useEffect, useMemo, useState } from "react";

import { useAiConfig, type RewriteModelRoute, type RewriteModelView } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GripVertical, Plus, Pencil, Trash2 } from "lucide-react";

type ViewDraft = Partial<RewriteModelView>;
type RouteDraft = Partial<RewriteModelRoute>;

const defaultViewDraft = { is_enabled: true, is_default: false, sort_order: 100 } satisfies ViewDraft;
const defaultRouteDraft = { is_enabled: true, priority: 100, weight: 100 } satisfies RouteDraft;

function RewriteViewDialog({
  open,
  view,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  view: ViewDraft | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<ViewDraft>(defaultViewDraft);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(open ? (view ? { ...defaultViewDraft, ...view } : defaultViewDraft) : defaultViewDraft);
  }, [open, view]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave(formData as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{view?.id ? "编辑模型视图" : "添加模型视图"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Key</Label>
            <Input value={formData.key || ""} onChange={(e) => setFormData({ ...formData, key: e.target.value })} disabled={!!view?.id} />
          </div>
          <div className="space-y-2">
            <Label>名称</Label>
            <Input value={formData.label || ""} onChange={(e) => setFormData({ ...formData, label: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Input value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" value={formData.sort_order ?? 100} onChange={(e) => setFormData({ ...formData, sort_order: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                <Label>启用</Label>
                <Switch checked={formData.is_enabled ?? true} onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewriteRouteDialog({
  open,
  route,
  modelViewId,
  onOpenChange,
  onSave,
  viewOptions,
  modelOptions,
}: {
  open: boolean;
  route: RouteDraft | null;
  modelViewId: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  viewOptions: Array<{ id: string; label: string }>;
  modelOptions: Array<{ id: string; label: string }>;
}) {
  const [formData, setFormData] = useState<RouteDraft>(defaultRouteDraft);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(
      open
        ? route
          ? { ...defaultRouteDraft, ...route }
          : { ...defaultRouteDraft, model_view_id: modelViewId ?? undefined }
        : defaultRouteDraft,
    );
  }, [open, route, modelViewId]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave(formData as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{route?.id ? "编辑路由" : "添加路由"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>模型视图</Label>
            <select
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm"
              value={formData.model_view_id || ""}
              onChange={(e) => setFormData({ ...formData, model_view_id: e.target.value })}
            >
              <option value="">请选择</option>
              {viewOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>provider_key_model_id</Label>
            <select
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm"
              value={formData.provider_key_model_id || ""}
              onChange={(e) => setFormData({ ...formData, provider_key_model_id: e.target.value || null })}
            >
              <option value="">自动补全</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={formData.priority ?? 100} onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
            <div className="space-y-2">
              <Label>Weight</Label>
              <Input type="number" value={formData.weight ?? 100} onChange={(e) => setFormData({ ...formData, weight: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>实际模型</Label>
            <Input value={formData.actual_model || ""} onChange={(e) => setFormData({ ...formData, actual_model: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>启用</Label>
            <Switch checked={formData.is_enabled ?? true} onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RewriteClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [viewModal, setViewModal] = useState<{ open: boolean; data: ViewDraft | null }>({ open: false, data: null });
  const [routeModal, setRouteModal] = useState<{ open: boolean; modelViewId: string | null; data: RouteDraft | null }>({ open: false, modelViewId: null, data: null });
  const [deleteTarget, setDeleteTarget] = useState<{ open: boolean; id: string | null; entity: "rewrite_model_view" | "rewrite_model_route" | null; title: string }>({ open: false, id: null, entity: null, title: "" });

  const modelOptions = useMemo(() => {
    if (!bundle) return [];
    return bundle.models.map((model) => {
      const key = bundle.keys.find((item) => item.id === model.key_id);
      const provider = bundle.providers.find((item) => item.id === key?.provider_id);
      return {
        id: model.id,
        label: `${provider?.name || "未知"} / ${key?.label || "未知"} / ${model.display_name || model.model_id}`,
      };
    });
  }, [bundle]);

  const viewOptions = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.rewriteModelViews]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((view) => ({ id: view.id, label: `${view.label} / ${view.key}` }));
  }, [bundle]);

  if (isLoading || !bundle) {
    return <div className="h-40 rounded-2xl border border-zinc-200 bg-zinc-50 animate-pulse" />;
  }

  const handleSaveView = async (data: Record<string, unknown>) => {
    const action = viewModal.data?.id ? "update" : "create";
    if (action === "update") data.id = viewModal.data?.id;
    const ok = await mutateEntity(action, "rewrite_model_view", data);
    if (ok) setViewModal({ open: false, data: null });
  };

  const handleSaveRoute = async (data: Record<string, unknown>) => {
    const action = routeModal.data?.id ? "update" : "create";
    if (action === "update") data.id = routeModal.data?.id;
    const ok = await mutateEntity(action, "rewrite_model_route", data);
    if (ok) setRouteModal({ open: false, modelViewId: null, data: null });
  };

  const handleDelete = async () => {
    if (!deleteTarget.id || !deleteTarget.entity) return;
    await mutateEntity("delete", deleteTarget.entity, { id: deleteTarget.id });
    setDeleteTarget({ open: false, id: null, entity: null, title: "" });
  };

  const views = [...bundle.rewriteModelViews].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">文案改写模型视图</h2>
          <p className="mt-1 text-xs text-zinc-500">只保留 modelViews 和 modelRoutes，其他复杂 UI 暂时不动。</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setViewModal({ open: true, data: null })}>
          <Plus className="size-4" /> 添加模型视图
        </Button>
      </div>

      <div className="space-y-4">
        {views.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 text-sm">
            暂无模型视图
          </div>
        ) : (
          views.map((view) => {
            const routes = bundle.rewriteModelRoutes.filter((route) => route.model_view_id === view.id);
            return (
              <div key={view.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <GripVertical className="size-4 text-zinc-300" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-800">{view.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px] h-5 bg-white">{view.key}</Badge>
                        {view.is_default ? <Badge className="h-5 text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-50">默认</Badge> : null}
                        {!view.is_enabled ? <Badge variant="outline" className="text-[10px] h-5">已停用</Badge> : null}
                      </div>
                      {view.description ? <div className="mt-0.5 text-xs text-zinc-500">{view.description}</div> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="size-8 text-zinc-400 hover:text-zinc-600" onClick={() => setViewModal({ open: true, data: view })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-zinc-400 hover:text-rose-600" onClick={() => setDeleteTarget({ open: true, id: view.id, entity: "rewrite_model_view", title: `删除模型视图 ${view.label}` })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">路由</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-[#D97757] hover:bg-[#D97757]/10 hover:text-[#C9604D]" onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: { model_view_id: view.id } })}>
                      <Plus className="mr-1 size-3" /> 添加路由
                    </Button>
                  </div>
                  {routes.length === 0 ? (
                    <div className="py-2 text-xs text-zinc-400">暂无路由</div>
                  ) : (
                    <div className="space-y-2">
                      {routes.map((route) => {
                        const model = bundle.models.find((item) => item.id === route.provider_key_model_id);
                        const key = bundle.keys.find((item) => item.id === model?.key_id);
                        const provider = bundle.providers.find((item) => item.id === key?.provider_id);
                        return (
                          <div key={route.id} className="group flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 transition-colors hover:bg-zinc-50">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-white text-zinc-500 font-mono text-[10px]">P{route.priority}</Badge>
                                <span className="truncate text-sm font-medium text-zinc-700">{route.actual_model}</span>
                                {!route.is_enabled ? <Badge variant="outline" className="h-5 text-[10px]">停用</Badge> : null}
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">
                                {provider?.name || "未知"} / {key?.label || "未知"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={route.is_enabled} onCheckedChange={(checked) => mutateEntity("update", "rewrite_model_route", { id: route.id, is_enabled: checked })} />
                              <Button variant="ghost" size="icon" className="size-6 text-zinc-400 hover:text-zinc-600" onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: route })}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-6 text-zinc-400 hover:text-rose-600" onClick={() => setDeleteTarget({ open: true, id: route.id, entity: "rewrite_model_route", title: `删除路由 ${route.actual_model}` })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <RewriteViewDialog open={viewModal.open} view={viewModal.data} onOpenChange={(open) => setViewModal({ ...viewModal, open })} onSave={handleSaveView} />
      <RewriteRouteDialog
        open={routeModal.open}
        route={routeModal.data}
        modelViewId={routeModal.modelViewId}
        onOpenChange={(open) => setRouteModal({ ...routeModal, open })}
        onSave={handleSaveRoute}
        viewOptions={viewOptions}
        modelOptions={modelOptions}
      />
      <ConfirmDialog
        open={deleteTarget.open}
        title={deleteTarget.title}
        description="此操作无法撤销，确定要删除吗？"
        confirmText="删除"
        cancelText="取消"
        destructive
        onConfirm={handleDelete}
        onOpenChange={(open) => setDeleteTarget({ ...deleteTarget, open })}
      />
    </div>
  );
}
