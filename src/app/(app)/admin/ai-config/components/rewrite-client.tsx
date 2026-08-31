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
import { Plus, Pencil, Trash2, Star, GitFork, Info } from "lucide-react";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时同步视图表单初始值（受控弹窗重置惯例）
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
              <div className="flex w-full items-center justify-between rounded-md border border-[#E5E0D6] px-3 py-2">
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
  viewOptions: Array<{ id: string; label: string; isEnabled?: boolean }>;
  modelOptions: Array<{ id: string; label: string; isEnabled?: boolean }>;
}) {
  const [formData, setFormData] = useState<RouteDraft>(defaultRouteDraft);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时同步路由表单初始值（受控弹窗重置惯例）
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
              className="w-full h-9 rounded-md border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 text-[13px] text-[#292524]"
              value={formData.model_view_id || ""}
              onChange={(e) => setFormData({ ...formData, model_view_id: e.target.value })}
            >
              <option value="">选一个模型视图</option>
              {viewOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.isEnabled} className={!option.isEnabled ? "text-[#78716C]" : ""}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="route-provider-key-model">物理映射 (渠道 / Key / 模型)</Label>
            <select
              id="route-provider-key-model"
              className="w-full h-9 rounded-md border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 text-[13px] text-[#292524]"
              value={formData.provider_key_model_id || ""}
              onChange={(e) => setFormData({ ...formData, provider_key_model_id: e.target.value || null })}
            >
              <option value="">自动分配</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.isEnabled} className={!option.isEnabled ? "text-[#78716C]" : ""}>
                  {option.label}
                </option>
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
            <Label>是否启用</Label>
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
      const isEnabled = model.is_enabled && (key ? key.is_enabled : true) && (provider ? provider.is_enabled : true);
      return {
        id: model.id,
        label: `${provider?.name || "未知"} / ${key?.label || "未知"} / ${model.display_name || model.model_id}${!isEnabled ? " (已停用)" : ""}`,
        isEnabled,
      };
    });
  }, [bundle]);

  const viewOptions = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.rewriteModelViews]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((view) => ({
        id: view.id,
        label: `${view.label} / ${view.key}${!view.is_enabled ? " (已停用)" : ""}`,
        isEnabled: view.is_enabled,
      }));
  }, [bundle]);

  if (isLoading || !bundle) {
    return <div className="h-40 rounded-2xl border border-[#E5E0D6] bg-[#FBF9F5] animate-pulse" />;
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
    <div className="space-y-5">
      {/* 顶栏提示说明 */}
      <div className="space-y-3 border-b border-[#ECE7DE]/80 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1C1917] font-medium text-[14px]">
            <GitFork className="size-4 text-[#D97757]" />
            <span>文案改写工具专属模型分发路由</span>
          </div>
        </div>
        <div className="flex items-start gap-2 text-[12px] text-[#78716C] bg-[#F5F3EE] p-2.5 rounded-xl">
          <Info className="size-4 text-[#43718E] shrink-0 mt-0.5" />
          <span>
            控制前台“文案改写”工作台在不同模式（如<em>快速模式/深度精修</em>）下的模型映射关系。非改写模块高级维护无须修改。
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-start min-h-[520px]">
        {/* 左栏：极简白底卡片导航 */}
        <div className="w-full md:w-[280px] border border-[#E5E0D6] rounded-2xl bg-white p-3 space-y-3 shrink-0">
          <div className="flex justify-between items-center px-2 py-1">
            <h2 className="text-[12px] font-normal text-[#78716C] tracking-wider">改写视图</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="新建视图"
              className="size-6 text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE] bg-[#FBF9F5] rounded-md shrink-0"
              onClick={() => setViewModal({ open: true, data: null })}
            >
              <Plus strokeWidth={2} className="size-3.5" />
            </Button>
          </div>

          <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1">
            {views.length === 0 ? (
              <div className="text-[12px] text-[#78716C] py-6 text-center">还没有改写视图</div>
            ) : (
              views.map((v) => {
                const isViewActive = activeViewId === v.id;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all text-[13px]",
                      isViewActive
                        ? "bg-[#F5F3EE]/80 text-[#1C1917] font-medium"
                        : "text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                    )}
                  >
                    <button
                      type="button"
                      aria-current={isViewActive ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none"
                      onClick={() => setSelectedViewId(v.id)}
                    >
                      <span className="truncate">{v.label}</span>
                      <Badge variant="outline" className={cn("font-mono text-[11px] h-4.5 px-1 py-0 bg-white shrink-0", isViewActive ? "text-[#292524] border-[#E5E0D6]" : "text-[#78716C] border-[#E5E0D6]")}>{v.key}</Badge>
                      {v.is_default && (
                        <Star strokeWidth={1.5} className="size-3 text-[#D97757] fill-[#D97757] shrink-0" />
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-1 pr-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`编辑视图 ${v.label}`}
                        className="size-5 text-[#78716C] hover:text-[#292524]"
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

        {/* 右栏：路由规则配置卡片 */}
        <div className="flex-1 border border-[#E5E0D6] rounded-2xl bg-white p-6 min-h-[460px] min-w-0 shadow-sm">
          {activeViewId && (() => {
            const view = bundle.rewriteModelViews.find((v) => v.id === activeViewId);
            if (!view) return <div className="text-[#78716C] text-[12px] py-10 text-center">模型视图已不存在</div>;
            const routes = bundle.rewriteModelRoutes.filter((route) => route.model_view_id === view.id);

            return (
              <div className="space-y-5">
                <div className="flex justify-between items-center border-b border-[#ECE7DE] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[14px] text-[#1C1917]">{view.label}</h3>
                      <Badge variant="outline" className="font-mono text-[12px] bg-[#FBF9F5]">{view.key}</Badge>
                      {view.is_default && <Badge className="h-5 text-[12px] bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/10 border-0 font-medium">默认规则</Badge>}
                    </div>
                    {view.description && (
                      <div className="text-[12px] text-[#78716C] mt-1">{view.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[12px] text-[#292524] bg-[#F5F3EE]/70 px-2 py-0.5 rounded-md">
                      <span>{view.is_enabled ? "已启用" : "已禁用"}</span>
                      <Switch
                        aria-label={`启用视图 ${view.label}`}
                        className="scale-75 origin-right"
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
                  <h4 className="text-[12px] font-normal text-[#78716C] uppercase tracking-wider">绑定的路由分配规则</h4>
                  <div className="rounded-xl border border-[#E5E0D6] overflow-hidden bg-white">
                    <Table>
                      <TableHeader className="bg-[#FBF9F5]/60">
                        <TableRow className="hover:bg-transparent border-[#ECE7DE]">
                          <TableHead className="h-8 w-[80px] py-1.5 pl-4 text-left text-[12px] font-normal text-[#78716C]">优先级</TableHead>
                          <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-[#78716C]">实际 Model ID</TableHead>
                          <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-[#78716C]">映射物理渠道 (渠道 / Key)</TableHead>
                          <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-[#78716C]">启用</TableHead>
                          <TableHead className="h-8 w-[100px] py-1.5 pr-4 text-right text-[12px] font-normal text-[#78716C]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {routes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-[13px] text-[#78716C]">
                              还没有路由规则，需要时点右上角添加
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
                                  "group hover:bg-[#FBF9F5]/50 h-9 transition-colors text-[13px]",
                                  !route.is_enabled && "opacity-60"
                                )}
                              >
                                <TableCell className="py-1 text-[12px] font-mono text-[#78716C] font-normal pl-4 text-left">
                                  P{route.priority}
                                </TableCell>
                                <TableCell className="py-1 font-mono text-[12px] font-medium text-[#1C1917] text-left">
                                  {route.actual_model}
                                </TableCell>
                                <TableCell className="py-1 text-[12px] text-[#78716C] text-left truncate max-w-[200px]">
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
                                      className="size-7 text-[#78716C] hover:text-[#292524]"
                                      onClick={() => setRouteModal({ open: true, modelViewId: view.id, data: route })}
                                    >
                                      <Pencil strokeWidth={1.5} className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`删除路由 ${route.actual_model}`}
                                      className="size-7 text-[#78716C] hover:text-[#C9604D]"
                                      onClick={() => setDeleteTarget({ open: true, id: route.id, entity: "rewrite_model_route", title: `删除路由 ${route.actual_model}` })}
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
              </div>
            );
          })()}

          {!activeViewId && (
            <div className="text-center py-20 text-[12px] text-[#78716C]">
              请在左侧选择模型视图以查看详情
            </div>
          )}
        </div>
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
        onConfirm={handleDelete}
        onOpenChange={(open) => setDeleteTarget({ ...deleteTarget, open })}
      />
    </div>
  );
}
