"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AiFeatureControl,
  useAiConfig,
} from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ItemHeading } from "@/components/ui/item-heading";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
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
  Info,
  Sparkles,
  Star,
  Archive,
  ArchiveRestore,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { BindingDialog } from "./bindings-dialogs";
import { ScreenshotRecognitionCard } from "./screenshot-recognition-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";


function FeatureBindingDetailDialog({
  open,
  control,
  onOpenChange,
}: {
  open: boolean;
  control: AiFeatureControl | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{control?.label ? `功能设置 · ${control.label}` : "功能设置"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          <p className="text-[13px] text-[#78716C]">{control?.description}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="s" onClick={() => onOpenChange(false)}>关闭</Button>
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
        <div className="h-40 rounded-2xl bg-[#FCFCFB] animate-pulse shadow-card-ring" />
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

  const businessControls = bundle.featureControls.filter(
    (control) =>
      control.group === "business" &&
      control.key !== "ocr_screenshot_structure",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[12px] text-[#1F1E1D] bg-[#F1F1F0]/70 p-2.5 px-3.5 rounded-xl">
        <Info className="size-4 text-status-info shrink-0" />
        <span>
          只需管理业务功能是否可用及模型策略。系统会负责路由、健康检测和备用渠道，内部标识不会影响日常操作。
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#141413] font-normal text-[14px]">
            <Sparkles className="size-4 text-[#78716C]" />
            <span>业务功能</span>
          </div>
        </div>

        {/* 统一顶层策略卡片（截图识别通道 + 全局默认兜底与顺位，留白分隔） */}
        <Card className=" p-4.5 gap-4">
          {/* 上半部：截图识别通道策略 */}
          <ScreenshotRecognitionCard />

          {/* 留白分隔与下半部：全局默认兜底 + 渠道顺位折叠透视 */}
          <div className="border-t border-[#E2E2DF]/60 pt-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* 左侧：全局默认兜底设置 */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-[13px] font-normal text-[#141413]">
                  <Star className="size-4 text-[#D97757]" />
                  <span>全局兜底：</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="全局兜底模型"
                        className="h-7 min-w-[210px] max-w-[280px] rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2.5 text-[12px] font-mono text-[#141413] transition-colors cursor-pointer flex items-center justify-between gap-2 shadow-input active:scale-[0.99] active:duration-120"
                      >
                        <span className="truncate">
                          {defaultModelId
                            ? modelDirectory.find(
                                (m) => m.modelId === defaultModelId,
                              )?.label ?? defaultModelId
                            : "未设置 · 全量顺位自动选择"}
                        </span>
                        <ChevronDown className="size-3.5 opacity-60 shrink-0" />
                      </button>
                    }
                  />
                  <DropdownMenuContent
                    align="start"
                    className="w-[min(260px,calc(100vw-2rem))] min-w-0 max-h-[calc(100dvh-var(--app-top-offset,64px)-1rem)] overflow-y-auto bg-white border border-[#E2E2DF] shadow-claude-float p-1"
                  >
                    <DropdownMenuItem
                      onClick={async () => {
                        setDefaultModelDraft(null);
                        await setGlobalDefaultModel("");
                      }}
                      className={cn(
                        "cursor-pointer text-[12px] flex items-center justify-between py-1.5 px-2 rounded-md transition-colors",
                        !defaultModelId
                          ? "bg-[#F1F1F0] font-normal text-[#141413]"
                          : "hover:bg-[#EBEBE9] text-[#1F1E1D]",
                      )}
                    >
                      <span>未设置 · 全量顺位自动选择</span>
                      {!defaultModelId && (
                        <Check className="size-3.5 text-[#D97757]" />
                      )}
                    </DropdownMenuItem>
                    {modelDirectory.length > 0 && (
                      <DropdownMenuSeparator className="bg-[#E2E2DF]/60 my-1" />
                    )}
                    {modelDirectory.map((entry) => {
                      const isSelected = defaultModelId === entry.modelId;
                      return (
                        <DropdownMenuItem
                          key={entry.modelId}
                          onClick={async () => {
                            setDefaultModelDraft(entry.modelId);
                            await setGlobalDefaultModel(entry.modelId);
                          }}
                          className={cn(
                            "cursor-pointer text-[12px] flex items-center justify-between py-1.5 px-2 rounded-md transition-colors",
                            isSelected
                              ? "bg-[#F1F1F0] font-normal text-[#141413]"
                              : "hover:bg-[#EBEBE9] text-[#1F1E1D]",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono truncate">
                              {entry.label}
                            </span>
                            <span className="text-[12px] text-[#78716C] bg-[#F1F1F0] px-1.5 rounded-md shrink-0">
                              {entry.channels.length} 渠道
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="size-3.5 text-[#D97757] shrink-0" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

            {/* 右侧：渠道顺位收展按钮 */}
            <button
              type="button"
              onClick={() => setShowRankedChannels((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] px-2.5 py-1 rounded-md hover:bg-[#EBEBE9] transition-colors cursor-pointer border border-[#E2E2DF]/60 bg-white"
            >
              <span className="size-1.5 rounded-full bg-current text-status-success" />
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
            <div className="border-t border-[#E2E2DF]/60 bg-[#FCFCFB]/40 overflow-x-auto max-h-[220px] overflow-y-auto">
              <Table>
                <TableHeader className="bg-[#FCFCFB]/80 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-b border-[#E2E2DF]/60">
                    <TableHead className="pl-5 w-[60px]">
                      顺位
                    </TableHead>
                    <TableHead>
                      渠道与 Key
                    </TableHead>
                    <TableHead>
                      健康态
                    </TableHead>
                    <TableHead className="pr-5">
                      支持模型
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedChannels.map((channel) => {
                    const healthy = isChannelHealthy(channel);
                    return (
                      <TableRow
                        key={channel.rank}
                        className="text-[12px] border-b border-[#E2E2DF]/60 last:border-b-0 hover:bg-[#F7F7F6]"
                      >
                        <TableCell className="pl-5 py-1.5 font-normal text-[#141413]">
                          {channel.rank}
                        </TableCell>
                        <TableCell className="py-1.5 font-normal text-[#1F1E1D]">
                          {channel.channelName}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {healthy ? (
                            <Badge variant="success">正常</Badge>
                          ) : (
                            <Badge variant="danger">熔断中 (连败 {channel.failures ?? 0} 次)</Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-5 py-1.5 text-[#78716C]">
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
                        还没有启用的渠道。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          </div>
        </Card>

        {/* 3. 业务功能表格 */}
        <Card className=" overflow-hidden p-0 gap-0 w-full overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#FCFCFB]/80">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="pl-5 w-[220px]">业务功能</TableHead>
                <TableHead>选用模型</TableHead>
                <TableHead className="w-[120px]">运行状态</TableHead>
                <TableHead className="w-[120px] text-right pr-5">
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
                    暂时没有可管理的业务功能。
                  </TableCell>
                </TableRow>
              ) : (
                businessControls.map((control) => {
                  return (
                    <TableRow
                      key={control.key}
                      className="hover:bg-[#F7F7F6] text-[13px] border-b border-[#E2E2DF]/60 last:border-b-0"
                    >
                      <TableCell className="pl-5 py-3 align-middle">
                        <div className="flex items-center gap-1">
                          <span className="font-normal text-[#141413]">
                            {control.key === "ocr_screenshot"
                              ? "截图识别"
                              : control.label}
                          </span>
                          {(control.key === "ocr_screenshot" ||
                            control.key === "ocr_screenshot_structure") && (
                            <Badge
                              variant="secondary"
                              className="bg-[#F1F1F0] text-[#78716C] text-[12px] h-4.5 px-1.5 font-normal"
                            >
                              首页核心
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#78716C] max-w-[220px] leading-relaxed">
                          {control.key === "ocr_screenshot"
                            ? "图片文字识别与结构化提取"
                            : control.description}
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
                          className="h-7 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2 text-[12px] font-mono text-[#141413] shadow-input focus:ring-1 focus:ring-[#141413]/10 transition-colors cursor-pointer min-w-[200px] max-w-[280px] truncate"
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
                            className="bg-[#F1F1F0] text-[#78716C] border-[#E2E2DF] text-[12px] font-normal"
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
                              className="h-7 px-2 text-[12px] text-[#1F1E1D] hover:text-[#141413] hover:bg-[#EBEBE9]"
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
                                className="h-7 px-2 text-[12px] text-[#1F1E1D] hover:text-[#141413] hover:bg-[#EBEBE9]"
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
                                className="h-7 px-2 text-[12px] text-[#78716C] hover:text-status-danger hover:bg-[#EBEBE9]"
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
        </Card>

        <div className="flex items-start gap-2 text-[12px] text-[#1F1E1D] bg-[#F1F1F0]/70 p-3 rounded-xl">
          <Info className="size-4 text-[#78716C] shrink-0 mt-0.5" />
          <div>
            <span className="font-normal text-[#1F1E1D]">历史配置说明：</span>
            旧版智能预警、成长建议旧配置、视频诊断旧配置等 5
            项历史废弃配置已于系统重构升级中安全下线清理。当前展示的功能均为活跃或主线业务功能。
          </div>
        </div>
      </div>


      <BindingDialog
        open={bindingModal.open}
        control={bindingModal.data}
        onOpenChange={(c) => setBindingModal({ ...bindingModal, open: c })}
        onSave={handleSaveBinding}
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
