"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AiFeatureControl,
  useAiConfig,
  type RewriteModelRoute,
  type RewriteModelView,
} from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pencil,
  Trash2,
  Plus,
  Info,
  Sparkles,
  GitFork,
  Star,
  Archive,
  ArchiveRestore,
  ChevronDown,
} from "lucide-react";
import { BindingDialog } from "./bindings-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type ViewDraft = Partial<RewriteModelView>;
type RouteDraft = Partial<RewriteModelRoute>;

const defaultViewDraft = {
  is_enabled: true,
  is_default: false,
  sort_order: 100,
} satisfies ViewDraft;
const defaultRouteDraft = {
  is_enabled: true,
  priority: 100,
  weight: 100,
} satisfies RouteDraft;

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
    setFormData(
      open
        ? view
          ? { ...defaultViewDraft, ...view }
          : defaultViewDraft
        : defaultViewDraft,
    );
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
          <DialogTitle>
            {view?.id ? "编辑改写视图" : "添加改写视图"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="view-key">Key</Label>
            <Input
              id="view-key"
              value={formData.key || ""}
              onChange={(e) =>
                setFormData({ ...formData, key: e.target.value })
              }
              disabled={!!view?.id}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-label">名称</Label>
            <Input
              id="view-label"
              value={formData.label || ""}
              onChange={(e) =>
                setFormData({ ...formData, label: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-description">描述</Label>
            <Input
              id="view-description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="view-sort-order">排序</Label>
              <Input
                id="view-sort-order"
                type="number"
                value={formData.sort_order ?? 100}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sort_order: Number.parseInt(e.target.value, 10) || 100,
                  })
                }
              />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border border-[#E5E0D6] px-3 py-2">
                <Label>启用</Label>
                <Switch
                  aria-label="启用模型视图"
                  checked={formData.is_enabled ?? true}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_enabled: checked })
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            保存
          </Button>
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
          <DialogTitle>
            {route?.id ? "编辑路由规则" : "添加路由规则"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="route-model-view">目标模型视图</Label>
            <select
              id="route-model-view"
              className="w-full h-9 rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
              value={formData.model_view_id || ""}
              onChange={(e) =>
                setFormData({ ...formData, model_view_id: e.target.value })
              }
            >
              <option value="">请选择</option>
              {viewOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={!option.isEnabled}
                  className={!option.isEnabled ? "text-[#78716C]" : ""}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="route-provider-key-model">
              物理映射 (渠道 / Key / 模型)
            </Label>
            <select
              id="route-provider-key-model"
              className="w-full h-9 rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
              value={formData.provider_key_model_id || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  provider_key_model_id: e.target.value || null,
                })
              }
            >
              <option value="">自动分配</option>
              {modelOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={!option.isEnabled}
                  className={!option.isEnabled ? "text-[#78716C]" : ""}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="route-priority">调度顺位 (优先级)</Label>
              <div className="space-y-1.5">
                <Input
                  id="route-priority"
                  type="number"
                  value={formData.priority ?? 100}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: Number.parseInt(e.target.value, 10) || 100,
                    })
                  }
                />
                <div className="flex items-center gap-1 text-[11px] text-[#78716C]">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: 10 })}
                    className="hover:text-[#D97757] underline"
                  >
                    首选 (10)
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: 50 })}
                    className="hover:text-[#D97757] underline"
                  >
                    次选 (50)
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: 100 })}
                    className="hover:text-[#D97757] underline"
                  >
                    备用 (100)
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-weight">分流权重 (Weight)</Label>
              <Input
                id="route-weight"
                type="number"
                value={formData.weight ?? 100}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    weight: Number.parseInt(e.target.value, 10) || 100,
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="route-actual-model">实际调用 Model ID</Label>
            <Input
              id="route-actual-model"
              placeholder="如 gpt-5.4-mini, gemini-2.5-flash"
              value={formData.actual_model || ""}
              onChange={(e) =>
                setFormData({ ...formData, actual_model: e.target.value })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>启用</Label>
            <Switch
              aria-label="启用路由"
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_enabled: checked })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BindingsClient() {
  const {
    bundle,
    isLoading,
    mutateEntity,
    saveFeatureControl,
    setGlobalDefaultModel,
    archiveFeature,
    restoreFeature,
  } = useAiConfig();
  // 全局默认兜底模型的本地草稿：undefined 表示尚未改动，跟随线上值
  const [defaultModelDraft, setDefaultModelDraft] = useState<
    string | null | undefined
  >(undefined);
  const [showRankedChannels, setShowRankedChannels] = useState(false);
  const [bindingModal, setBindingModal] = useState<{
    open: boolean;
    data: AiFeatureControl | null;
  }>({
    open: false,
    data: null,
  });
  const [archiveControl, setArchiveControl] = useState<AiFeatureControl | null>(
    null,
  );

  const [viewModal, setViewModal] = useState<{
    open: boolean;
    data: ViewDraft | null;
  }>({ open: false, data: null });
  const [routeModal, setRouteModal] = useState<{
    open: boolean;
    modelViewId: string | null;
    data: RouteDraft | null;
  }>({ open: false, modelViewId: null, data: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string | null;
    entity:
      "feature_binding" | "rewrite_model_view" | "rewrite_model_route" | null;
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
    if (
      selectedViewId &&
      bundle.rewriteModelViews.some((view) => view.id === selectedViewId)
    ) {
      return selectedViewId;
    }
    return (
      [...bundle.rewriteModelViews].sort(
        (left, right) => left.sort_order - right.sort_order,
      )[0]?.id ?? null
    );
  }, [bundle, selectedViewId]);

  const modelOptions = useMemo(() => {
    if (!bundle) return [];
    return bundle.models.map((model) => {
      const key = bundle.keys.find((item) => item.id === model.key_id);
      const provider = bundle.providers.find(
        (item) => item.id === key?.provider_id,
      );
      const isEnabled =
        model.is_enabled &&
        (key ? key.is_enabled : true) &&
        (provider ? provider.is_enabled : true);
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

  const [nowTs] = useState(() => Date.now());

  // 模型为主：按模型聚合全部健康渠道（顺位 = 供应商优先级 + Key 优先级）
  const modelDirectory = useMemo(() => {
    if (!bundle) return [];
    const byModel = new Map<
      string,
      {
        modelId: string;
        label: string;
        channels: { name: string; score: number; healthy: boolean }[];
      }
    >();
    for (const model of bundle.models) {
      if (!model.is_enabled) continue;
      const key = bundle.keys.find((item) => item.id === model.key_id);
      if (!key || !key.is_enabled) continue;
      const provider = bundle.providers.find(
        (item) => item.id === key.provider_id,
      );
      if (!provider || !provider.is_enabled) continue;
      const healthy =
        !key.unhealthy_until ||
        new Date(key.unhealthy_until).getTime() <= nowTs;

      const entry = byModel.get(model.model_id) ?? {
        modelId: model.model_id,
        label: model.model_id,
        channels: [],
      };
      entry.channels.push({
        name: `${provider.name} / ${key.label}`,
        score: key.priority + provider.priority,
        healthy,
      });
      byModel.set(model.model_id, entry);
    }
    return [...byModel.values()]
      .map((entry) => ({
        ...entry,
        channels: [...entry.channels].sort((a, b) => a.score - b.score),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bundle, nowTs]);

  const rankedChannels = useMemo(() => {
    if (!bundle) return [];
    return bundle.keys
      .filter((key) => key.is_enabled)
      .map((key) => ({
        key,
        provider: bundle.providers.find((item) => item.id === key.provider_id),
      }))
      .filter((item): item is { key: (typeof bundle.keys)[number]; provider: (typeof bundle.providers)[number] } =>
        Boolean(item.provider && item.provider.is_enabled),
      )
      .map((item) => ({ ...item, score: item.key.priority + item.provider.priority }))
      .sort((a, b) => a.score - b.score)
      .map((item, index) => ({
        rank: index + 1,
        channelName: `${item.provider.name} / ${item.key.label}`,
        models: bundle.models
          .filter((model) => model.key_id === item.key.id && model.is_enabled)
          .map((model) => model.display_name || model.model_id),
        unhealthyUntil: item.key.unhealthy_until,
        failures: item.key.consecutive_failures,
      }));
  }, [bundle]);

  const isChannelHealthy = (channel: (typeof rankedChannels)[number]) => {
    if (!channel.unhealthyUntil) return true;
    return new Date(channel.unhealthyUntil).getTime() <= nowTs;
  };

  if (isLoading || !bundle) {
    return (
      <div className="space-y-4">
        <div className="h-40 rounded-2xl bg-[#FBF9F5] animate-pulse border border-[#E5E0D6]" />
      </div>
    );
  }

  const defaultBinding = bundle.featureBindings.find(
    (binding) => binding.feature_key === "default",
  );
  const defaultModelId =
    defaultModelDraft !== undefined
      ? defaultModelDraft
      : defaultBinding?.model_id ?? null;

  const handleSaveBinding = async (data: Record<string, unknown>) => {
    return saveFeatureControl(data);
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
    await mutateEntity("delete", deleteConfirm.entity, {
      id: deleteConfirm.id,
    });
    setDeleteConfirm({ open: false, id: null, entity: null, title: "" });
  };

  const views = [...bundle.rewriteModelViews].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const businessControls = bundle.featureControls.filter(
    (control) => control.group === "business",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[12px] text-[#292524] bg-[#F5F3EE]/70 p-2.5 px-3.5 rounded-xl">
        <Info className="size-4 text-[#43718E] shrink-0" />
        <span>
          只需管理业务功能是否可用及模型策略。系统会负责路由、健康检测和备用渠道，内部标识不会影响日常操作。
        </span>
      </div>

      {/* 极简单行工具条：全局默认兜底 + 渠道顺位可折叠透视 */}
      <div className="rounded-2xl bg-white border border-[#E5E0D6] overflow-hidden select-none">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 bg-white">
          {/* 左侧：全局默认兜底设置 */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#1C1917]">
              <Star className="size-4 text-[#D97757]" />
              <span>全局默认兜底：</span>
            </div>
            <select
              aria-label="全局默认兜底模型"
              className="h-7.5 min-w-[200px] rounded-lg border border-[#E5E0D6] bg-[#F5F3EE]/80 hover:bg-[#F5F3EE] px-2 text-[12px] font-mono text-[#1C1917] transition-colors cursor-pointer"
              value={defaultModelId ?? ""}
              onChange={(event) =>
                setDefaultModelDraft(event.target.value || null)
              }
            >
              <option value="">未设置 · 走全量顺位自动选择</option>
              {modelDirectory.map((entry) => (
                <option key={entry.modelId} value={entry.modelId}>
                  {entry.label} ({entry.channels.length} 渠道可用)
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-7.5 px-2.5 text-[12px] bg-white border border-[#E5E0D6] hover:bg-[#F5F3EE] text-[#292524]"
              disabled={
                (defaultModelId ?? "") === (defaultBinding?.model_id ?? "")
              }
              onClick={async () => {
                await setGlobalDefaultModel(defaultModelId ?? "");
              }}
            >
              保存默认
            </Button>
          </div>

          {/* 右侧：渠道顺位收展按钮 */}
          <button
            type="button"
            onClick={() => setShowRankedChannels((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-[12px] text-[#78716C] hover:text-[#1C1917] px-2.5 py-1 rounded-md hover:bg-[#F5F3EE] transition-colors cursor-pointer border border-[#E5E0D6]/80 bg-white"
          >
            <span className="size-1.5 rounded-full bg-[#16A34A]" />
            <span>渠道顺位表 ({rankedChannels.length})</span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200 opacity-70",
                showRankedChannels && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* 折叠区：渠道自动顺位表（默认收起，展开时平滑展示） */}
        {showRankedChannels && (
          <div className="border-t border-[#E5E0D6]/60 bg-[#FBF9F5]/40 overflow-x-auto max-h-[220px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-[#FBF9F5]/80 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent border-b border-[#E5E0D6]/60">
                  <TableHead className="text-[11px] pl-5 w-[60px] py-1.5">顺位</TableHead>
                  <TableHead className="text-[11px] py-1.5">渠道与 Key</TableHead>
                  <TableHead className="text-[11px] py-1.5">健康态</TableHead>
                  <TableHead className="text-[11px] pr-5 py-1.5">支持模型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankedChannels.map((channel) => {
                  const healthy = isChannelHealthy(channel);
                  return (
                    <TableRow
                      key={channel.rank}
                      className="text-[12px] border-b border-[#E5E0D6]/40 last:border-b-0 hover:bg-[#FBF9F5]/60"
                    >
                      <TableCell className="pl-5 py-1.5 font-medium text-[#1C1917]">
                        {channel.rank}
                      </TableCell>
                      <TableCell className="py-1.5 font-medium text-[12px] text-[#292524]">
                        {channel.channelName}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {healthy ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#16A34A]">
                            <span className="size-1.5 rounded-full bg-[#16A34A]" />
                            正常
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#C9604D]">
                            <span className="size-1.5 rounded-full bg-[#C9604D]" />
                            熔断中 (连败 {channel.failures ?? 0} 次)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5 py-1.5 text-[11px] text-[#78716C]">
                        {channel.models.join("、") || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rankedChannels.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-12 text-center text-[12px] text-[#78716C]"
                    >
                      暂无启用的渠道。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1C1917] font-medium text-[14px]">
            <Sparkles className="size-4 text-[#78716C]" />
            <span>业务功能</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white overflow-hidden border border-[#E5E0D6] w-full overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#FBF9F5]/80">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-[12px] pl-5 w-[220px]">业务功能</TableHead>
                <TableHead className="text-[12px]">选用模型</TableHead>
                <TableHead className="w-[120px] text-[12px]">运行状态</TableHead>
                <TableHead className="w-[120px] text-right text-[12px] pr-5">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businessControls.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-[#78716C] text-[13px]"
                  >
                    暂无可管理的业务功能。
                  </TableCell>
                </TableRow>
              ) : (
                businessControls.map((control) => {
                  return (
                    <TableRow
                      key={control.key}
                      className="hover:bg-[#FBF9F5]/50 text-[13px] border-b border-[#E5E0D6]/60 last:border-b-0"
                    >
                      <TableCell className="pl-5 py-3 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[#1C1917]">
                            {control.label}
                          </span>
                          {(control.key === "ocr_screenshot" ||
                            control.key === "ocr_screenshot_structure") && (
                            <Badge
                              variant="secondary"
                              className="bg-[#F5F3EE] text-[#292524] text-[10px] h-4.5 px-1.5 font-normal"
                            >
                              首页核心
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#78716C] max-w-[200px] leading-relaxed">
                          {control.description}
                        </div>
                      </TableCell>

                      {/* 模型策略：行内直选 */}
                      <TableCell className="py-3 align-middle">
                        <select
                          aria-label={`${control.label} 选用模型`}
                          value={control.modelId ?? ""}
                          onChange={async (e) => {
                            await saveFeatureControl({
                              feature_key: control.key,
                              model_id: e.target.value || null,
                              is_enabled: control.isEnabled,
                              system_prompt: control.systemPrompt,
                              output_token_limit: control.outputTokenLimit,
                              context_message_limit:
                                control.contextMessageLimit,
                              provider_key_model_id:
                                control.providerKeyModelId,
                            });
                          }}
                          className="h-7.5 rounded-md border border-[#E5E0D6] bg-[#F5F3EE]/80 hover:bg-[#F5F3EE] px-2 text-[12px] font-mono text-[#1C1917] focus:ring-1 focus:ring-[#D97757]/30 transition-colors cursor-pointer min-w-[200px] max-w-[280px] truncate"
                        >
                          <option value="">
                            全局默认 ({defaultBinding?.model_id || "全量顺位"})
                          </option>
                          {modelDirectory.map((entry) => (
                            <option key={entry.modelId} value={entry.modelId}>
                              {entry.label} ({entry.channels.length} 渠道可用)
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      {/* 运行状态：行内即时 Switch */}
                      <TableCell className="py-3 align-top">
                        {control.lifecycleState === "archived" ? (
                          <Badge
                            variant="outline"
                            className="bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6] text-[11px] font-normal"
                          >
                            已停止
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2 pt-0.5">
                            <Switch
                              aria-label={`启用 ${control.label}`}
                              checked={control.isEnabled}
                              onCheckedChange={async (checked) => {
                                await saveFeatureControl({
                                  feature_key: control.key,
                                  model_id: control.modelId,
                                  is_enabled: checked,
                                  system_prompt: control.systemPrompt,
                                  output_token_limit: control.outputTokenLimit,
                                  context_message_limit:
                                    control.contextMessageLimit,
                                  provider_key_model_id:
                                    control.providerKeyModelId,
                                });
                              }}
                            />
                            <span className="text-[12px] text-[#78716C] select-none">
                              {control.isEnabled ? "运行中" : "已暂停"}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* 操作列 */}
                      <TableCell className="text-right pr-5 py-3 align-top">
                        <div className="flex items-center justify-end gap-1">
                          {control.lifecycleState === "archived" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={`恢复${control.label}`}
                              aria-label={`恢复${control.label}`}
                              className="h-7 px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                              onClick={() => restoreFeature(control.key)}
                            >
                              <ArchiveRestore className="size-3.5 mr-1 text-[#78716C]" />
                              恢复
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={`设置${control.label}`}
                                aria-label={`设置${control.label}`}
                                className="h-7 px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                                onClick={() =>
                                  setBindingModal({
                                    open: true,
                                    data: control,
                                  })
                                }
                              >
                                <Pencil className="size-3.5 mr-1 text-[#78716C]" />
                                高级设置
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={`停止使用${control.label}`}
                                aria-label={`停止使用${control.label}`}
                                className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#C9604D] hover:bg-[#F5F3EE]/50"
                                onClick={() => setArchiveControl(control)}
                              >
                                <Archive className="size-3.5 mr-1 opacity-70" />
                                停止
                              </Button>
                            </>
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

        <div className="flex items-start gap-2.5 text-[12px] text-[#292524] bg-[#F5F3EE]/70 p-3 rounded-xl">
          <Info className="size-4 text-[#78716C] shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-[#292524]">历史配置说明：</span>
            旧版智能预警、成长建议旧配置、视频诊断旧配置等 5
            项历史废弃配置已于系统重构升级中安全下线清理。当前展示的功能均为活跃或主线业务功能。
          </div>
        </div>
      </div>

      {/* 第二板块：文案改写场景模型路由 (依靠 24px 留白美学切割，无需物理 border-t) */}
      <div className="space-y-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1C1917] font-medium text-[14px]">
            <GitFork className="size-4 text-[#78716C]" />
            <span>文案改写模型分配规则</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start min-h-[460px]">
          <div className="w-full md:w-[250px] bg-white p-3 space-y-2 shrink-0 border border-[#E5E0D6] rounded-2xl">
            <div className="flex justify-between items-center px-2 py-1">
              <h2 className="text-[12px] font-normal text-[#78716C] tracking-wider">
                改写视图
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="新建视图"
                className="size-5 text-[#78716C] hover:text-[#292524] bg-[#F5F3EE]/70 rounded shrink-0"
                onClick={() => setViewModal({ open: true, data: null })}
              >
                <Plus strokeWidth={2} className="size-3" />
              </Button>
            </div>

            <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
              {views.length === 0 ? (
                <div className="text-[12px] text-[#78716C] py-6 text-center">
                  暂无视图
                </div>
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
                          : "text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]",
                      )}
                    >
                      <button
                        type="button"
                        aria-current={isViewActive ? "true" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline-none"
                        onClick={() => setSelectedViewId(v.id)}
                      >
                        <span className="truncate">{v.label}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[12px] h-4 px-1 py-0 bg-white shrink-0 border-[#E5E0D6]",
                            isViewActive && "text-[#1C1917]",
                          )}
                        >
                          {v.key}
                        </Badge>
                        {v.is_default && (
                          <Star
                            strokeWidth={1.5}
                            className="size-3 text-[#D97757] fill-[#D97757] shrink-0"
                          />
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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

          <div className="flex-1 bg-white p-4 min-h-[420px] min-w-0 border border-[#E5E0D6] rounded-2xl">
            {activeViewId &&
              (() => {
                const view = bundle.rewriteModelViews.find(
                  (v) => v.id === activeViewId,
                );
                if (!view)
                  return (
                    <div className="text-[#78716C] text-[12px] py-10 text-center">
                      模型视图已不存在
                    </div>
                  );
                const routes = bundle.rewriteModelRoutes.filter(
                  (route) => route.model_view_id === view.id,
                );

                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-[14px] text-[#1C1917]">
                            {view.label}
                          </h3>
                          <Badge
                            variant="outline"
                            className="font-mono text-[12px] bg-[#FBF9F5] border-[#E5E0D6]"
                          >
                            {view.key}
                          </Badge>
                          {view.is_default && (
                            <Badge className="h-4.5 text-[12px] bg-[#6FAA7D]/10 text-[#6FAA7D] border-0 font-medium">
                              默认规则
                            </Badge>
                          )}
                        </div>
                        {view.description && (
                          <div className="text-[12px] text-[#78716C] mt-0.5">
                            {view.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[12px]"
                          onClick={() =>
                            setViewModal({ open: true, data: view })
                          }
                        >
                          <Pencil strokeWidth={1.5} className="size-3 mr-1" />{" "}
                          编辑视图
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[12px]"
                          onClick={() =>
                            setRouteModal({
                              open: true,
                              modelViewId: view.id,
                              data: { model_view_id: view.id },
                            })
                          }
                        >
                          <Plus strokeWidth={1.5} className="size-3 mr-1" />{" "}
                          添加路由
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl overflow-hidden bg-white border border-[#E5E0D6] w-full overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-[#FBF9F5]/80">
                          <TableRow className="hover:bg-transparent border-0">
                            <TableHead className="h-8 w-[110px] py-1.5 pl-4 text-left text-[12px] font-normal text-[#78716C]">
                              顺位 (优先级)
                            </TableHead>
                            <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-[#78716C]">
                              实际 Model ID
                            </TableHead>
                            <TableHead className="h-8 py-1.5 text-left text-[12px] font-normal text-[#78716C]">
                              映射物理渠道
                            </TableHead>
                            <TableHead className="h-8 w-[85px] py-1.5 text-left text-[12px] font-normal text-[#78716C]">
                              启用
                            </TableHead>
                            <TableHead className="h-8 w-[100px] py-1.5 pr-4 text-right text-[12px] font-normal text-[#78716C]">
                              操作
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {routes.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="py-8 text-center text-[13px] text-[#78716C]"
                              >
                                暂无路由规则，点击右上角添加
                              </TableCell>
                            </TableRow>
                          ) : (
                            routes.map((route) => {
                              const model = bundle.models.find(
                                (item) =>
                                  item.id === route.provider_key_model_id,
                              );
                              const key = bundle.keys.find(
                                (item) => item.id === model?.key_id,
                              );
                              const provider = bundle.providers.find(
                                (item) => item.id === key?.provider_id,
                              );

                              return (
                                <TableRow
                                  key={route.id}
                                  className={cn(
                                    "group hover:bg-[#FBF9F5]/50 h-9 transition-colors text-[13px] border-b border-[#E5E0D6]/60 last:border-b-0",
                                    !route.is_enabled && "opacity-60",
                                  )}
                                >
                                  <TableCell className="py-1 pl-4 text-left">
                                    {route.priority <= 10 ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#16A34A]/10 text-[#16A34A]">
                                        首选 (P{route.priority})
                                      </span>
                                    ) : route.priority <= 50 ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#43718E]/10 text-[#43718E]">
                                        次选 (P{route.priority})
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-normal bg-[#F5F3EE] text-[#78716C] border border-[#E5E0D6]">
                                        备用 (P{route.priority})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-1 font-mono text-[12px] font-medium text-[#1C1917] text-left">
                                    {route.actual_model}
                                  </TableCell>
                                  <TableCell className="py-1 text-[12px] text-[#78716C] text-left truncate max-w-[200px]">
                                    {provider
                                      ? `${provider.name} / ${key?.label}`
                                      : "自动分配"}
                                  </TableCell>
                                  <TableCell className="py-1 text-left">
                                    <Switch
                                      aria-label={`启用路由 ${route.actual_model}`}
                                      className="scale-75 origin-left"
                                      checked={route.is_enabled}
                                      onCheckedChange={(checked) =>
                                        mutateEntity(
                                          "update",
                                          "rewrite_model_route",
                                          { id: route.id, is_enabled: checked },
                                        )
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="py-1 text-right pr-4">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`编辑路由 ${route.actual_model}`}
                                        className="size-7 text-[#78716C] hover:text-[#292524]"
                                        onClick={() =>
                                          setRouteModal({
                                            open: true,
                                            modelViewId: view.id,
                                            data: route,
                                          })
                                        }
                                      >
                                        <Pencil
                                          strokeWidth={1.5}
                                          className="size-3.5"
                                        />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`删除路由 ${route.actual_model}`}
                                        className="size-7 text-[#78716C] hover:text-[#C9604D]"
                                        onClick={() =>
                                          setDeleteConfirm({
                                            open: true,
                                            id: route.id,
                                            entity: "rewrite_model_route",
                                            title: `删除路由 ${route.actual_model}`,
                                          })
                                        }
                                      >
                                        <Trash2
                                          strokeWidth={1.5}
                                          className="size-3.5"
                                        />
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
              <div className="text-center py-20 text-[12px] text-[#78716C]">
                请在左侧选择模型视图
              </div>
            )}
          </div>
        </div>
      </div>

      <BindingDialog
        open={bindingModal.open}
        control={bindingModal.data}
        onOpenChange={(c) => setBindingModal({ ...bindingModal, open: c })}
        onSave={handleSaveBinding}
      />
      <RewriteViewDialog
        open={viewModal.open}
        view={viewModal.data}
        onOpenChange={(open) => setViewModal({ ...viewModal, open })}
        onSave={handleSaveView}
      />
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
      <ConfirmDialog
        open={!!archiveControl}
        title={
          archiveControl?.key === "ocr_screenshot" || archiveControl?.key === "ocr_screenshot_structure"
            ? `停止使用 ${archiveControl?.label}（警告：首页核心功能）`
            : `停止使用${archiveControl?.label ?? "该功能"}`
        }
        description={
          archiveControl?.key === "ocr_screenshot" || archiveControl?.key === "ocr_screenshot_structure"
            ? "警告：截图识别是首页日报填报的核心依赖。停止使用后，用户在首页将无法自动解析上传的截图图片。确认要停止该功能吗？"
            : "系统会保存当前模型映射和历史设置，并阻止前台发起该 AI 功能请求。恢复前不会删除任何配置。"
        }
        confirmText="停止使用"
        cancelText="取消"
        onConfirm={async () => {
          if (archiveControl) await archiveFeature(archiveControl.key);
          setArchiveControl(null);
        }}
        onOpenChange={(open) => {
          if (!open) setArchiveControl(null);
        }}
      />
    </div>
  );
}
