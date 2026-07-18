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
import { GripVertical, Plus, Pencil, Trash2, Server, Star } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
            <Label htmlFor="view-key">Key</Label>
            <Input id="view-key" value={formData.key || ""} onChange={(e) => setFormData({ ...formData, key: e.target.value })} disabled={!!view?.id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-label">名称</Label>
            <Input id="view-label" value={formData.label || ""} onChange={(e) => setFormData({ ...formData, label: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-description">描述</Label>
            <Input id="view-description" value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="view-sort-order">排序</Label>
              <Input id="view-sort-order" type="number" value={formData.sort_order ?? 100} onChange={(e) => setFormData({ ...formData, sort_order: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border border-stone-200 px-3 py-2">
                <Label>启用</Label>
                <Switch aria-label="启用模型视图" checked={formData.is_enabled ?? true} onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })} />
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
            <Label htmlFor="route-model-view">模型视图</Label>
            <select
              id="route-model-view"
              className="w-full h-9 rounded-md border border-stone-200 bg-white px-3 text-[13px]"
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
            <Label htmlFor="route-provider-key-model">物理映射 (渠道 / 分组 / 模型)</Label>
            <select
              id="route-provider-key-model"
              className="w-full h-9 rounded-md border border-stone-200 bg-white px-3 text-[13px]"
              value={formData.provider_key_model_id || ""}
              onChange={(e) => setFormData({ ...formData, provider_key_model_id: e.target.value || null })}
            >
              <option value="">自动分配</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="route-priority">Priority (优先级)</Label>
              <Input id="route-priority" type="number" value={formData.priority ?? 100} onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-weight">Weight (权重)</Label>
              <Input id="route-weight" type="number" value={formData.weight ?? 100} onChange={(e) => setFormData({ ...formData, weight: Number.parseInt(e.target.value, 10) || 100 })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="route-actual-model">实际模型</Label>
            <Input id="route-actual-model" value={formData.actual_model || ""} onChange={(e) => setFormData({ ...formData, actual_model: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>启用</Label>
            <Switch aria-label="启用路由" checked={formData.is_enabled ?? true} onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })} />
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

  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    if (bundle && bundle.rewriteModelViews.length > 0 && !activeViewId) {
      const sorted = [...bundle.rewriteModelViews].sort((a, b) => a.sort_order - b.sort_order);
      setActiveViewId(sorted[0].id);
    }
  }, [bundle, activeViewId]);

  useEffect(() => {
    if (!bundle) return;
    if (activeViewId) {
      const exists = bundle.rewriteModelViews.some(v => v.id === activeViewId);
      if (!exists && bundle.rewriteModelViews.length > 0) {
        const sorted = [...bundle.rewriteModelViews].sort((a, b) => a.sort_order - b.sort_order);
        setActiveViewId(sorted[0].id);
      }
    }
  }, [bundle, activeViewId]);

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
    return <div className="h-40 rounded-2xl border border-stone-200 bg-stone-50 animate-pulse" />;
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
    <div className="flex flex-col md:flex-row gap-3 items-start min-h-[580px]">
      {/* 左栏：极简白底卡片导航 */}
      <div className="w-full md:w-[280px] border border-stone-200 rounded-2xl bg-white p-3 space-y-3 shrink-0">
        <div className="flex justify-between items-center px-2 py-1">
          <h2 className="text-[12px] font-normal text-stone-500 tracking-wider">模型视图</h2>
          <Button variant="ghost" size="icon" aria-label="新建视图" className="size-6 text-stone-500 hover:text-stone-700 hover:bg-stone-100 bg-stone-50 rounded-md shrink-0" onClick={() => setViewModal({ open: true, data: null })}>
            <Plus strokeWidth={2} className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1">
          {views.length === 0 ? (
            <div className="text-[12px] text-stone-500 py-6 text-center">暂无模型视图</div>
          ) : (
            views.map((v) => {
              const isViewActive = activeViewId === v.id;
              return (
                <div
                  key={v.id}
                  className={cn(
                    "group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all text-[13px]",
                    isViewActive
                      ? "bg-stone-100/80 text-stone-900 font-medium"
                      : "text-stone-700 hover:bg-stone-50 hover:text-stone-900"
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
                    onClick={() => setActiveViewId(v.id)}
                  >
                    <span className="truncate">{v.label}</span>
                    <Badge variant="outline" className={cn("font-mono text-[12px] h-4.5 px-1 py-0 bg-white shrink-0", isViewActive ? "text-stone-700 border-stone-300" : "text-stone-500 border-stone-200")}>{v.key}</Badge>
                    {v.is_default && (
                      <Star strokeWidth={1.5} className="size-3 text-[#B4532F] fill-[#D97757] shrink-0" />
                    )}
                    {!v.is_enabled && (
                      <span className="text-[12px] text-stone-500 bg-stone-100 px-1 rounded-sm shrink-0">停用</span>
                    )}
                  </button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0 pr-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`编辑视图 ${v.label}`}
                      className="size-5 text-stone-500 hover:text-stone-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewModal({ open: true, data: v });
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
      </div>

      {/* 右栏：独立白底配置卡片 */}
      <div className="flex-1 border border-stone-200 rounded-2xl bg-white p-6 min-h-[480px] min-w-0">
        {activeViewId && (() => {
          const view = bundle.rewriteModelViews.find((v) => v.id === activeViewId);
          if (!view) return <div className="text-stone-500 text-[12px] py-10 text-center">模型视图已不存在</div>;
          const routes = bundle.rewriteModelRoutes.filter((route) => route.model_view_id === view.id);

          return (
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[13px] leading-[1.5] text-stone-900">{view.label}</h3>
                    <Badge variant="outline" className="font-mono text-[12px] bg-stone-50">{view.key}</Badge>
                    {view.is_default && <Badge className="h-5 text-[12px] bg-[#6FAA7D]/10 text-[#3F7A4E] hover:bg-[#6FAA7D]/10">默认</Badge>}
                  </div>
                  {view.description && (
                    <div className="text-[12px] text-stone-500 mt-1">{view.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">
                    <span>{view.is_enabled ? "已启用" : "已禁用"}</span>
                    <Switch
                      aria-label={`启用视图 ${view.label}`}
                      className="scale-75"
                      checked={view.is_enabled}
                      onCheckedChange={(checked) => mutateEntity("update", "rewrite_model_view", { id: view.id, is_enabled: checked })}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setViewModal({ open: true, data: view })}>
                    <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑
                  </Button>
                  <Button size="sm" className="h-7 text-[12px]" onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: { model_view_id: view.id } })}>
                    <Plus strokeWidth={1.5} className="size-3 mr-1" /> 添加路由
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[12px] font-normal text-stone-500 uppercase tracking-wider">绑定的路由分配规则</h4>
                <div className="rounded-lg border border-stone-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-stone-50/50">
                      <TableRow>
                        <TableHead className="h-8 w-[80px] py-1.5 pl-3 text-left text-[12px] font-normal text-stone-500">优先级</TableHead>
                        <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-stone-500">目标实际模型</TableHead>
                        <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-stone-500">物理渠道 (渠道 / 分组)</TableHead>
                        <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-stone-500">启用</TableHead>
                        <TableHead className="h-8 w-[100px] py-1.5 pr-3 text-right text-[12px] font-normal text-stone-500">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-[13px] text-stone-500">
                            暂无路由，请点击右上角添加
                          </TableCell>
                        </TableRow>
                      ) : (
                        routes.map((route) => {
                          const model = bundle.models.find((item) => item.id === route.provider_key_model_id);
                          const key = bundle.keys.find((item) => item.id === model?.key_id);
                          const provider = bundle.providers.find((item) => item.id === key?.provider_id);

                          return (
                            <TableRow
                              key={route.id}
                              className={cn(
                                "group hover:bg-stone-50/50 h-9 transition-colors",
                                !route.is_enabled && "opacity-60"
                              )}
                            >
                              <TableCell className="py-1 text-[12px] font-mono text-stone-500 font-normal pl-3 text-left">
                                P{route.priority}
                              </TableCell>
                              <TableCell className="py-1 text-[13px] font-medium text-stone-900 text-left">
                                {route.actual_model}
                              </TableCell>
                              <TableCell className="py-1 text-[12px] text-stone-500 text-left truncate max-w-[200px]">
                                {provider ? `${provider.name} / ${key?.label}` : "自动分配"}
                              </TableCell>
                              <TableCell className="py-1 text-left">
                                <Switch
                                  aria-label={`启用路由 ${route.actual_model}`}
                                  className="scale-75 origin-left"
                                  checked={route.is_enabled}
                                  onCheckedChange={(checked) => mutateEntity("update", "rewrite_model_route", { id: route.id, is_enabled: checked })}
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right pr-3">
                                <div className="flex items-center justify-end relative h-7">
                                  <div className="absolute right-1.5 opacity-30 group-hover:opacity-0 transition-opacity">
                                    <span className="text-stone-500 text-[12px] tracking-widest font-normal">···</span>
                                  </div>
                                  <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`编辑路由 ${route.actual_model}`}
                                      className="size-7 text-stone-500 hover:text-stone-700"
                                      onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: route })}
                                    >
                                      <Pencil strokeWidth={1.5} className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`删除路由 ${route.actual_model}`}
                                      className="size-7 text-stone-500 hover:text-[#B24E3E]"
                                      onClick={() => setDeleteTarget({ open: true, id: route.id, entity: "rewrite_model_route", title: `删除路由 ${route.actual_model}` })}
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

        {!activeViewId && (
          <div className="text-center py-20 text-[12px] text-stone-500">
            请在左侧选择模型视图以查看详情
          </div>
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
