"use client";

import { useEffect, useMemo, useState } from "react";
import { AiFeatureBinding, useAiConfig, type RewriteModelRoute, type RewriteModelView } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus, Info, Sparkles, GitFork, Star } from "lucide-react";
import { BindingDialog } from "./bindings-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
          <DialogTitle>{view?.id ? "编辑改写视图" : "添加改写视图"}</DialogTitle>
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
              <div className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
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
          <DialogTitle>{route?.id ? "编辑路由规则" : "添加路由规则"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="route-model-view">目标模型视图</Label>
            <select
              id="route-model-view"
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
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
            <Label htmlFor="route-provider-key-model">物理映射 (渠道 / Key / 模型)</Label>
            <select
              id="route-provider-key-model"
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-[13px]"
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
            <Label htmlFor="route-actual-model">实际调用 Model ID</Label>
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

export default function BindingsClient() {
  const { bundle, isLoading, mutateEntity } = useAiConfig();
  const [bindingModal, setBindingModal] = useState<{ open: boolean; data: Partial<AiFeatureBinding> | null }>({
    open: false,
    data: null,
  });

  const [viewModal, setViewModal] = useState<{ open: boolean; data: ViewDraft | null }>({ open: false, data: null });
  const [routeModal, setRouteModal] = useState<{ open: boolean; modelViewId: string | null; data: RouteDraft | null }>({ open: false, modelViewId: null, data: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string | null;
    entity: "feature_binding" | "rewrite_model_view" | "rewrite_model_route" | null;
    title: string;
  }>({
    open: false,
    id: null,
    entity: null,
    title: "",
  });

  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const activeViewId = useMemo(() => {
    if (!bundle) return selectedViewId;
    if (selectedViewId && bundle.rewriteModelViews.some((view) => view.id === selectedViewId)) {
      return selectedViewId;
    }
    return [...bundle.rewriteModelViews].sort((left, right) => left.sort_order - right.sort_order)[0]?.id ?? null;
  }, [bundle, selectedViewId]);

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
    return (
      <div className="space-y-4">
        <div className="h-40 rounded-2xl bg-zinc-50 animate-pulse border border-zinc-200" />
      </div>
    );
  }

  const getModelName = (providerKeyModelId: string | null) => {
    if (!providerKeyModelId) return "自动继承 (全局默认模型)";
    const model = bundle.models.find((m) => m.id === providerKeyModelId);
    if (!model) return "未知模型";
    const key = bundle.keys.find((k) => k.id === model.key_id);
    const provider = bundle.providers.find((p) => p.id === key?.provider_id);
    return `${model.display_name || model.model_id} (${provider?.name || "未知渠道"})`;
  };

  const handleSaveBinding = async (data: Record<string, unknown>) => {
    const action = bindingModal.data?.id ? "update" : "create";
    if (action === "update") data.id = bindingModal.data?.id;
    const ok = await mutateEntity(action, "feature_binding", data);
    if (ok) setBindingModal({ open: false, data: null });
  };

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
    if (!deleteConfirm.id || !deleteConfirm.entity) return;
    await mutateEntity("delete", deleteConfirm.entity, { id: deleteConfirm.id });
    setDeleteConfirm({ open: false, id: null, entity: null, title: "" });
  };

  const views = [...bundle.rewriteModelViews].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      {/* 规范 2.2：极简浅灰槽底提示 */}
      <div className="flex items-center gap-2 text-[12px] text-zinc-600 bg-zinc-100/70 p-2.5 px-3.5 rounded-xl">
        <Info className="size-4 text-[#5F82A8] shrink-0" />
        <span>未单独绑定的功能全自动继承全局主模型。在此可为特定业务场景与改写模式设定专属模型。</span>
      </div>

      {/* 第一板块：通用特例业务功能绑定 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-900 font-semibold text-[14px]">
            <Sparkles className="size-4 text-zinc-500" />
            <span>通用业务功能绑定 (Feature Bindings)</span>
          </div>
          <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setBindingModal({ open: true, data: null })}>
            <Plus className="size-3" /> 添加业务绑定
          </Button>
        </div>

        <div className="rounded-2xl bg-white overflow-hidden border border-zinc-200/80">
          <Table>
            <TableHeader className="bg-zinc-50/80">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-[180px] text-[12px] pl-5">功能标识 (Feature Key)</TableHead>
                <TableHead className="w-[180px] text-[12px]">功能名称</TableHead>
                <TableHead className="text-[12px]">指定模型</TableHead>
                <TableHead className="w-[140px] text-[12px]">上下文/输出限制</TableHead>
                <TableHead className="w-[90px] text-[12px]">状态</TableHead>
                <TableHead className="w-[100px] text-right text-[12px] pr-5">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundle.featureBindings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-400 text-[13px]">
                    暂无特例绑定，全站功能均自动使用全局默认模型。
                  </TableCell>
                </TableRow>
              ) : (
                bundle.featureBindings.map((binding) => {
                  const isDefault = binding.feature_key === "default";

                  return (
                    <TableRow key={binding.id} className="hover:bg-zinc-50/50 text-[13px] border-b border-zinc-200/60 last:border-b-0">
                      <TableCell className="font-mono text-[12px] text-zinc-700 pl-5">
                        {binding.feature_key}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900">
                        <div className="flex items-center gap-1.5">
                          {binding.label}
                          {isDefault && (
                            <span className="text-[10px] bg-[#D97757]/10 text-[#D97757] font-semibold px-1.5 py-0.2 rounded-full">
                              全局默认
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-[12px] text-zinc-700 bg-zinc-100/80 px-2 py-0.5 rounded-md font-mono">
                          <Sparkles className="size-3 text-[#D97757]" />
                          {getModelName(binding.provider_key_model_id)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-zinc-500 font-mono">
                        {binding.context_message_limit} 轮 / {binding.output_token_limit} tk
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={`启用绑定 ${binding.label}`}
                          className="scale-75 origin-left"
                          checked={binding.is_enabled}
                          onCheckedChange={(c) => mutateEntity("update", "feature_binding", { id: binding.id, is_enabled: c })}
                        />
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-zinc-500 hover:text-zinc-700"
                            onClick={() => setBindingModal({ open: true, data: binding })}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {!isDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-zinc-500 hover:text-[#C9604D]"
                              onClick={() =>
                                setDeleteConfirm({ open: true, id: binding.id, entity: "feature_binding", title: `删除功能绑定 ${binding.label}` })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
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

      {/* 第二板块：文案改写场景模型路由 (依靠 24px 留白美学切割，无需物理 border-t) */}
      <div className="space-y-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-900 font-semibold text-[14px]">
            <GitFork className="size-4 text-zinc-500" />
            <span>文案改写工具模式路由 (Rewrite Routes)</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start min-h-[460px]">
          <div className="w-full md:w-[250px] bg-white p-3 space-y-2 shrink-0 border border-zinc-200/80 rounded-2xl">
            <div className="flex justify-between items-center px-2 py-1">
              <h2 className="text-[12px] font-normal text-zinc-500 tracking-wider">改写视图</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="新建视图"
                className="size-5 text-zinc-500 hover:text-zinc-700 bg-zinc-100/70 rounded shrink-0"
                onClick={() => setViewModal({ open: true, data: null })}
              >
                <Plus strokeWidth={2} className="size-3" />
              </Button>
            </div>

            <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
              {views.length === 0 ? (
                <div className="text-[12px] text-zinc-500 py-6 text-center">暂无视图</div>
              ) : (
                views.map((v) => {
                  const isViewActive = activeViewId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        "group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all text-[13px]",
                        isViewActive
                          ? "bg-zinc-100/80 text-zinc-900 font-medium"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      )}
                    >
                      <button
                        type="button"
                        aria-current={isViewActive ? "true" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline-none"
                        onClick={() => setSelectedViewId(v.id)}
                      >
                        <span className="truncate">{v.label}</span>
                        <Badge variant="outline" className={cn("font-mono text-[10px] h-4 px-1 py-0 bg-white shrink-0 border-zinc-200", isViewActive && "text-zinc-900")}>{v.key}</Badge>
                        {v.is_default && (
                          <Star strokeWidth={1.5} className="size-3 text-[#D97757] fill-[#D97757] shrink-0" />
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`编辑视图 ${v.label}`}
                          className="size-5 text-zinc-500 hover:text-zinc-700"
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

          <div className="flex-1 bg-white p-4 min-h-[420px] min-w-0 border border-zinc-200/80 rounded-2xl">
            {activeViewId && (() => {
              const view = bundle.rewriteModelViews.find((v) => v.id === activeViewId);
              if (!view) return <div className="text-zinc-500 text-[12px] py-10 text-center">模型视图已不存在</div>;
              const routes = bundle.rewriteModelRoutes.filter((route) => route.model_view_id === view.id);

              return (
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[14px] text-zinc-900">{view.label}</h3>
                        <Badge variant="outline" className="font-mono text-[11px] bg-zinc-50 border-zinc-200">{view.key}</Badge>
                        {view.is_default && <Badge className="h-4.5 text-[10px] bg-[#6FAA7D]/10 text-[#6FAA7D] border-0 font-medium">默认规则</Badge>}
                      </div>
                      {view.description && (
                        <div className="text-[12px] text-zinc-500 mt-0.5">{view.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setViewModal({ open: true, data: view })}>
                        <Pencil strokeWidth={1.5} className="size-3 mr-1" /> 编辑视图
                      </Button>
                      <Button size="sm" className="h-7 text-[12px]" onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: { model_view_id: view.id } })}>
                        <Plus strokeWidth={1.5} className="size-3 mr-1" /> 添加路由
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden bg-white border border-zinc-200/80">
                    <Table>
                      <TableHeader className="bg-zinc-50/80">
                        <TableRow className="hover:bg-transparent border-0">
                          <TableHead className="h-8 w-[80px] py-1.5 pl-4 text-left text-[12px] font-normal text-zinc-500">优先级</TableHead>
                          <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-zinc-500">实际 Model ID</TableHead>
                          <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-zinc-500">映射物理渠道</TableHead>
                          <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-zinc-500">启用</TableHead>
                          <TableHead className="h-8 w-[100px] py-1.5 pr-4 text-right text-[12px] font-normal text-zinc-500">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {routes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-[13px] text-zinc-400">
                              暂无路由规则，请点击右上角添加
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
                                  "group hover:bg-zinc-50/50 h-9 transition-colors text-[13px] border-b border-zinc-200/60 last:border-b-0",
                                  !route.is_enabled && "opacity-60"
                                )}
                              >
                                <TableCell className="py-1 text-[12px] font-mono text-zinc-500 font-normal pl-4 text-left">
                                  P{route.priority}
                                </TableCell>
                                <TableCell className="py-1 font-mono text-[12px] font-medium text-zinc-900 text-left">
                                  {route.actual_model}
                                </TableCell>
                                <TableCell className="py-1 text-[12px] text-zinc-500 text-left truncate max-w-[200px]">
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
                                <TableCell className="py-1 text-right pr-4">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`编辑路由 ${route.actual_model}`}
                                      className="size-7 text-zinc-500 hover:text-zinc-700"
                                      onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: route })}
                                    >
                                      <Pencil strokeWidth={1.5} className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`删除路由 ${route.actual_model}`}
                                      className="size-7 text-zinc-500 hover:text-[#C9604D]"
                                      onClick={() => setDeleteConfirm({ open: true, id: route.id, entity: "rewrite_model_route", title: `删除路由 ${route.actual_model}` })}
                                    >
                                      <Trash2 strokeWidth={1.5} className="size-3.5" />
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
                </div>
              );
            })()}

            {!activeViewId && (
              <div className="text-center py-20 text-[12px] text-zinc-500">
                请在左侧选择模型视图
              </div>
            )}
          </div>
        </div>
      </div>

      <BindingDialog
        open={bindingModal.open}
        binding={bindingModal.data}
        onOpenChange={(c) => setBindingModal({ ...bindingModal, open: c })}
        onSave={handleSaveBinding}
      />
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
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        description="此操作无法撤销，确定要删除吗？"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleDelete}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
      />
    </div>
  );
}
