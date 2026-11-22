"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Settings2,
  Archive,
  ArchiveRestore,
  Play,
  AlertCircle,
  ArrowRight,
  Clock,
  Gauge,
} from "lucide-react";
import { useAiConfig, type AiFeatureControl } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { OcrSpeedDrawer } from "./ocr-speed-drawer";
import { DangerousActionDialog, type ImpactConfirmationState } from "./dangerous-action-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { AI_CONFIG_MESSAGES, formatLatency } from "@/lib/ai-config/presentation";
import type { BusinessAssuranceItem } from "@/lib/ai-config/availability";
import { cn } from "@/lib/utils";
import { repairTargetModelId } from "../ai-config-view";

const DEFAULT_ROW_HINT = "没指定模型、或指定的不能用时，都用它";

/**
 * 功能状态：正常只给一个浅色「正常」（模型名下拉里已经有，不再说第二遍）；
 * 顶班、停摆才用颜色说清楚，并给「去修 →」直达下方那个模型。
 */
function BusinessStatus({
  assurance,
  modelFamilyNameMap,
  onRepairModel,
}: {
  assurance: BusinessAssuranceItem | undefined;
  modelFamilyNameMap: Record<string, string>;
  onRepairModel?: (modelId: string) => void;
}) {
  if (!assurance) {
    return <span className="text-[12px] text-[#A8A29E]">未接入监控</span>;
  }

  if (assurance.routingStatus === "normal") {
    return (
      <span className="text-[12px] text-[#78716C]">正常</span>
    );
  }

  const { messageKey, selectedModelId, preferredModelId } = assurance;
  const rawTemplate = AI_CONFIG_MESSAGES[messageKey] || "状态未知";
  const preferredName = preferredModelId ? modelFamilyNameMap[preferredModelId] || preferredModelId : "无可用模型";
  const selectedName = selectedModelId ? modelFamilyNameMap[selectedModelId] || selectedModelId : "全局默认";
  const text = rawTemplate
    .replace("{preferredModelName}", preferredName)
    .replace("{selectedModelName}", selectedName);
  const isOutage = assurance.routingStatus === "outage";
  const repairModelId = repairTargetModelId(assurance);

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]",
        // 顶班不是故障，不许标红，用温和警示墨度
        isOutage ? "text-status-danger-text" : "text-[#8A6A2F]",
      )}
    >
      {isOutage ? (
        <AlertCircle className="size-3.5 shrink-0 text-status-danger" />
      ) : (
        <Clock className="size-3.5 shrink-0" />
      )}
      <span>{text}</span>
      {repairModelId && onRepairModel && (
        <button
          type="button"
          onClick={() => onRepairModel(repairModelId)}
          className="inline-flex items-center gap-0.5 rounded-md px-1 text-[12px] underline-offset-2 hover:underline"
        >
          去修 <ArrowRight className="size-3" />
        </button>
      )}
    </span>
  );
}

export function BusinessFunctionsPanel({ onRepairModel }: { onRepairModel?: (modelId: string) => void }) {
  const { bundle, runCommand } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  const [bindingModal, setBindingModal] = useState<{
    open: boolean;
    data: AiFeatureControl | null;
  }>({
    open: false,
    data: null,
  });

  const [archiveModal, setArchiveModal] = useState<AiFeatureControl | null>(null);
  const [testingOcr, setTestingOcr] = useState(false);
  const [speedDrawerOpen, setSpeedDrawerOpen] = useState(false);
  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);

  // 全局默认兜底设置
  const defaultBinding = bundle?.featureBindings.find((b) => b.feature_key === "default");
  const globalDefaultModelId = defaultBinding?.model_id ?? report?.globalDefaultModelId ?? null;

  // 模型名映射表
  const modelFamilyNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (report?.modelFamilies) {
      for (const f of report.modelFamilies) {
        map[f.modelId] = f.displayName;
      }
    }
    return map;
  }, [report]);

  // 业务保障字典
  const assuranceMap = useMemo(() => {
    const map: Record<string, BusinessAssuranceItem> = {};
    if (report?.businessAssurances) {
      for (const a of report.businessAssurances) {
        map[a.key] = a;
      }
    }
    return map;
  }, [report]);

  // 截图识别配置
  const ocrControl = useMemo(() => {
    return bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;
  }, [bundle]);

  // 活跃业务功能列表
  const businessFeatures = useMemo(() => {
    if (!bundle) return [];
    return bundle.featureControls.filter(
      (c) =>
        c.group === "business" &&
        c.key !== "ocr_screenshot" &&
        c.lifecycleState !== "archived"
    );
  }, [bundle]);

  const archivedFeatures = useMemo(() => {
    if (!bundle) return [];
    return bundle.featureControls.filter(
      (c) => c.lifecycleState === "archived"
    );
  }, [bundle]);

  // 统一带确认执行命令
  const executeWithConfirm = useCallback(
    async (
      action: string,
      data: Record<string, unknown>,
      entity?: "provider" | "key" | "model" | "feature_binding",
      successMsg?: string
    ) => {
      const res = await runCommand(action, data, entity);
      if (res.ok) {
        if (successMsg) feedbackToast.success(successMsg);
        return true;
      }

      if (res.status === 409 && res.requiresConfirmation) {
        setImpactConfirm({
          type: "impact",
          affectedBusinesses: res.affectedBusinesses || [],
          onConfirm: async () => {
            const retryRes = await runCommand(action, { ...data, confirm_impact: true }, entity);
            if (retryRes.ok) {
              if (successMsg) feedbackToast.success(successMsg);
            } else {
              feedbackToast.error(retryRes.error || "操作失败");
            }
          },
        });
        return false;
      }

      feedbackToast.error(res.error || "操作失败");
      return false;
    },
    [runCommand]
  );

  const handleModelChange = async (featureKey: string, nextModelId: string | null) => {
    const ctrl = bundle?.featureControls.find((c) => c.key === featureKey);
    if (!ctrl) return;
    await executeWithConfirm(
      "save_feature_control",
      {
        feature_key: ctrl.key,
        model_id: nextModelId,
        system_prompt: ctrl.systemPrompt,
        output_token_limit: ctrl.outputTokenLimit,
        context_message_limit: ctrl.contextMessageLimit,
        is_enabled: ctrl.isEnabled,
      },
      undefined,
      `已更新「${ctrl.label}」模型调度`
    );
  };

  const handleGlobalDefaultChange = async (nextModelId: string | null) => {
    if (!nextModelId) return;
    await executeWithConfirm(
      "set_global_default_model",
      { model_id: nextModelId },
      undefined,
      "已更新全局默认 AI 模型"
    );
  };

  const handleOcrModelChange = async (newModelId: string | null) => {
    if (!ocrControl) return;
    await executeWithConfirm(
      "save_feature_control",
      {
        feature_key: "ocr_screenshot",
        model_id: newModelId,
        system_prompt: ocrControl.systemPrompt,
        output_token_limit: ocrControl.outputTokenLimit,
        context_message_limit: ocrControl.contextMessageLimit,
        is_enabled: ocrControl.isEnabled,
      },
      undefined,
      "已更新截图识别模型调度"
    );
  };

  const handleOcrTrialRun = async () => {
    if (!bundle || !ocrControl) return;
    setTestingOcr(true);
    try {
      const res = await runCommand("test_key", { feature_key: "ocr_screenshot" });
      if (!res.ok) {
        feedbackToast.error(`试跑未通过: ${res.error || "服务无响应"}`, { duration: 6000 });
        return;
      }
      const testRes = (res.body as Record<string, unknown>).testResult as
        | { ok?: boolean; model?: string; channelLabel?: string; channelName?: string; latencyMs?: number; message?: string }
        | undefined;
      if (!testRes?.ok) {
        feedbackToast.error(`试跑未通过: ${testRes?.message || "服务未返回测试结果"}`, { duration: 6000 });
        return;
      }
      const modelLabel = testRes?.model ? (modelFamilyNameMap[testRes.model] || testRes.model) : "自动调度";
      const keyLabel = testRes?.channelLabel || testRes?.channelName || "可用渠道";
      const latencyText = testRes?.latencyMs ? ` · 耗时 ${formatLatency(testRes.latencyMs)}` : "";
      feedbackToast.success(`试跑连通正常 · ${modelLabel} · 渠道「${keyLabel}」${latencyText}`);
    } finally {
      setTestingOcr(false);
    }
  };

  const handleSaveAdvanced = async (data: Record<string, unknown>) => {
    return await executeWithConfirm(
      "save_feature_control",
      data,
      undefined,
      "已更新业务功能高级配置"
    );
  };

  const handleConfirmArchive = async () => {
    if (!archiveModal) return;
    const target = archiveModal;
    setArchiveModal(null);
    await executeWithConfirm(
      "archive_feature",
      { feature_key: target.key },
      undefined,
      `已停用「${target.label}」`
    );
  };

  const handleRestore = async (ctrl: AiFeatureControl) => {
    await executeWithConfirm(
      "restore_feature",
      { feature_key: ctrl.key },
      undefined,
      `已恢复「${ctrl.label}」`
    );
  };

  // 行内入口：桌面是图标（悬停有说明）；手机没有悬停，图标旁带短字
  const actionButton = (
    key: string,
    opts: { label: string; title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean },
    labeled: boolean,
  ) => (
    <Button
      key={key}
      variant="ghost"
      size={labeled ? "s" : "icon-s"}
      onClick={opts.onClick}
      disabled={opts.disabled}
      className={cn(
        labeled ? "h-7 gap-1 px-2 text-[12px]" : "size-7",
        "text-[#78716C]",
        opts.danger ? "hover:text-status-danger" : "hover:text-[#141413]",
      )}
      title={opts.title}
      aria-label={opts.title}
    >
      {opts.icon}
      {labeled && <span>{opts.label}</span>}
    </Button>
  );

  // 截图识别三个并列入口：测速台账、试跑、高级配置
  const ocrActions = (labeled = false) => (
    <div className="flex items-center justify-end gap-1">
      {actionButton("speed", { label: "测速", title: "测速台账", icon: <Gauge className="size-3.5" />, onClick: () => setSpeedDrawerOpen(true) }, labeled)}
      {actionButton("trial", { label: "试跑", title: "快速连通性试跑", icon: <Play className={cn("size-3.5", testingOcr && "animate-spin")} />, onClick: handleOcrTrialRun, disabled: testingOcr }, labeled)}
      {actionButton("advanced", { label: "高级", title: "高级配置", icon: <Settings2 className="size-3.5" />, onClick: () => ocrControl && setBindingModal({ open: true, data: ocrControl }) }, labeled)}
    </div>
  );

  const featureActions = (ctrl: AiFeatureControl, labeled = false) => (
    <div className="flex items-center justify-end gap-1">
      {actionButton("advanced", { label: "高级", title: "高级参数设置", icon: <Settings2 className="size-3.5" />, onClick: () => setBindingModal({ open: true, data: ctrl }) }, labeled)}
      {actionButton("archive", { label: "停用", title: "停用此业务功能", icon: <Archive className="size-3.5" />, onClick: () => setArchiveModal(ctrl), danger: true }, labeled)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 桌面端：一行一个功能。说明收进名字的悬停提示，只有兜底行留一句 */}
      <div className="hidden rounded-xl border border-[#E2E2DF] bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E2E2DF] bg-[#F7F7F6]/60">
              <TableHead className="w-[200px] text-[12px] text-[#78716C] pl-4">功能</TableHead>
              <TableHead className="w-[260px] text-[12px] text-[#78716C]">用哪个模型</TableHead>
              <TableHead className="text-[12px] text-[#78716C]">现在状态</TableHead>
              <TableHead className="w-[120px] text-right text-[12px] text-[#78716C] pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 兜底行：靠排第一、底色略深区分，不用橙色标签 */}
            <TableRow className="border-b border-[#E2E2DF] bg-[#F7F7F6]/60 hover:bg-[#F7F7F6]">
              <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-[#141413]">全局默认</span>
                  <span className="inline-flex h-5 items-center rounded-md bg-[#EBEBE9] px-1.5 text-[12px] text-[#78716C]">兜底</span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#78716C]">{DEFAULT_ROW_HINT}</p>
              </TableCell>
              <TableCell>
                <ModelFamilySelect
                  value={globalDefaultModelId}
                  onChange={handleGlobalDefaultChange}
                  featureKey="default"
                  allowEmptyLabel={null}
                  triggerTitle="全局默认必须指定模型"
                />
              </TableCell>
              <TableCell>
                <BusinessStatus assurance={assuranceMap["default"]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
              </TableCell>
              <TableCell className="pr-4" />
            </TableRow>

            {ocrControl && (
              <TableRow className="border-b border-[#E2E2DF] hover:bg-[#F7F7F6]/60">
                <TableCell className="pl-4">
                  <span className="text-[14px] text-[#141413]" title={ocrControl.description}>
                    {ocrControl.label}
                  </span>
                </TableCell>
                <TableCell>
                  <ModelFamilySelect
                    value={ocrControl.modelId}
                    onChange={handleOcrModelChange}
                    featureKey="ocr_screenshot"
                    allowEmptyLabel="跟随全局默认"
                  />
                </TableCell>
                <TableCell>
                  <BusinessStatus assurance={assuranceMap["ocr_screenshot"]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
                </TableCell>
                <TableCell className="pr-4 text-right">{ocrActions()}</TableCell>
              </TableRow>
            )}

            {businessFeatures.map((ctrl) => (
              <TableRow key={ctrl.key} className="border-b border-[#E2E2DF] hover:bg-[#F7F7F6]/60">
                <TableCell className="pl-4">
                  <span className="text-[14px] text-[#141413]" title={ctrl.description}>
                    {ctrl.label}
                  </span>
                </TableCell>
                <TableCell>
                  <ModelFamilySelect
                    value={ctrl.modelId}
                    onChange={(nextId) => handleModelChange(ctrl.key, nextId)}
                    featureKey={ctrl.key}
                    allowEmptyLabel="跟随全局默认"
                  />
                </TableCell>
                <TableCell>
                  <BusinessStatus assurance={assuranceMap[ctrl.key]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
                </TableCell>
                <TableCell className="pr-4 text-right">{featureActions(ctrl)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 手机端：同一组功能，一张卡一个（截图识别也在里面） */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-xl border border-[#E2E2DF] bg-[#F7F7F6] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-[#141413]">全局默认</span>
            <span className="inline-flex h-5 items-center rounded-md bg-[#EBEBE9] px-1.5 text-[12px] text-[#78716C]">兜底</span>
          </div>
          <p className="text-[12px] text-[#78716C]">{DEFAULT_ROW_HINT}</p>
          <ModelFamilySelect
            value={globalDefaultModelId}
            onChange={handleGlobalDefaultChange}
            featureKey="default"
            allowEmptyLabel={null}
          />
          <BusinessStatus assurance={assuranceMap["default"]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
        </div>

        {ocrControl && (
          <div className="rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[#141413]">{ocrControl.label}</span>
              {ocrActions(true)}
            </div>
            {/* 手机没有悬停，说明直接显示 */}
            {ocrControl.description && <p className="text-[12px] text-[#78716C]">{ocrControl.description}</p>}
            <ModelFamilySelect
              value={ocrControl.modelId}
              onChange={handleOcrModelChange}
              featureKey="ocr_screenshot"
              allowEmptyLabel="跟随全局默认"
            />
            <BusinessStatus assurance={assuranceMap["ocr_screenshot"]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
          </div>
        )}

        {businessFeatures.map((ctrl) => (
          <div key={ctrl.key} className="rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[#141413]">{ctrl.label}</span>
              {featureActions(ctrl, true)}
            </div>
            {ctrl.description && <p className="text-[12px] text-[#78716C]">{ctrl.description}</p>}
            <ModelFamilySelect
              value={ctrl.modelId}
              onChange={(nextId) => handleModelChange(ctrl.key, nextId)}
              featureKey={ctrl.key}
              allowEmptyLabel="跟随全局默认"
            />
            <BusinessStatus assurance={assuranceMap[ctrl.key]} modelFamilyNameMap={modelFamilyNameMap} onRepairModel={onRepairModel} />
          </div>
        ))}
      </div>

      {/* 已停用/已归档功能抽屉 */}
      {archivedFeatures.length > 0 && (
        <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-4">
          <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-3">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-[#78716C]" />
              <span className="text-[14px] text-[#1F1E1D]">已停用的业务功能 ({archivedFeatures.length})</span>
            </div>
          </div>
          <div className="divide-y divide-[#E2E2DF]/40">
            {archivedFeatures.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-[13px] text-[#78716C]">{f.label}</span>
                </div>
                <Button
                  variant="outline"
                  size="s"
                  onClick={() => handleRestore(f)}
                  className="h-7 text-[12px] border-[#E2E2DF]"
                >
                  <ArchiveRestore className="size-3 mr-1" />
                  恢复功能
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高级参数设置弹窗 */}
      <BindingDialog
        control={bindingModal.data}
        open={bindingModal.open}
        onOpenChange={(open) => setBindingModal((prev) => ({ ...prev, open }))}
        onSave={handleSaveAdvanced}
      />

      {/* 停用功能确认弹窗 */}
      <ConfirmDialog
        open={Boolean(archiveModal)}
        onOpenChange={(open) => !open && setArchiveModal(null)}
        title="停用业务功能确认"
        description={`停用「${archiveModal?.label}」后，该业务将无法发起新的 AI 请求。已有的配置将被保留，随时可恢复。`}
        confirmText="确认停用"
        cancelText="取消"
        onConfirm={handleConfirmArchive}
      />

      {/* 统一高风险影响确认弹窗 */}
      <DangerousActionDialog
        state={impactConfirm}
        onClose={() => setImpactConfirm(null)}
      />

      {/* 截图识别测速台账抽屉 */}
      <OcrSpeedDrawer
        open={speedDrawerOpen}
        onOpenChange={setSpeedDrawerOpen}
      />
    </div>
  );
}
