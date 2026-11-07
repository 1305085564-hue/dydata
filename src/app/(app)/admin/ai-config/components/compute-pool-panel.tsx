"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAiConfig, AI_MODEL_BATCH_TIMEOUT_MS, startDetectionRefresh } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { useFrozenOrder } from "../hooks/use-frozen-order";
import { compareModelFamilies } from "@/lib/ai-config/list-order";
import { PoolViewSwitcher, type PoolViewMode } from "./pool-view-switcher";
import { ComputePoolHeader } from "./compute-pool-header";
import { ModelFamilyCard } from "./model-family-card";
import { ChannelPoolView } from "./channel-pool-view";
import { AddKeyDialog } from "./add-key-dialog";
import { SyncModelsDialog } from "./sync-models-dialog";
import { DangerousActionDialog, type ImpactConfirmationState } from "./dangerous-action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import type { CheckResultItem } from "./channel-model-test-list";
import { cn } from "@/lib/utils";

// 恢复模型只说响应能证明的结果：零条不等于本来已开，缺字段也不推断
export function modelToggleSuccessMessage(
  enabled: boolean,
  changedSupplyCount?: number,
): string {
  if (!enabled) return "已停用模型";
  if (changedSupplyCount === undefined) {
    return "恢复请求已处理；实际开启条数未返回，请查看渠道状态";
  }
  return changedSupplyCount > 0
    ? `已重新开启 ${changedSupplyCount} 条渠道供应`
    : "本次未恢复任何渠道供应；手动停用的渠道需逐条开启";
}

export function ComputePoolPanel() {
  const { bundle, runCommand, loadData } = useAiConfig();
  const report = useAvailabilityReport(bundle);
  const searchParams = useSearchParams();

  // 视角模式：模型视角 (model) vs 渠道视角 (channel)
  const [viewMode, setViewMode] = useState<PoolViewMode>("model");

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "model" || view === "channel") {
      setViewMode(view);
    }
  }, [searchParams]);

  useEffect(() => () => {
    detectionRefreshRef.current?.stop();
  }, []);

  const handleViewModeChange = (nextMode: PoolViewMode) => {
    setViewMode(nextMode);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", nextMode);
      window.history.pushState(null, "", url.toString());
    }
  };

  // 模型筛选：D1 只看在用 / 全部，默认只看在用（isShelved=true）
  const [shelveFilter, setShelveFilter] = useState<"in_use" | "all">("in_use");
  const [searchQuery, setSearchQuery] = useState("");

  // 检查测试状态
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [detectionState, setDetectionState] = useState<"idle" | "reading" | "stopped">("idle");
  const detectionRefreshRef = useRef<{ stop: () => void } | null>(null);
  const [checkResult, setCheckResult] = useState<{
    total: number;
    successCount: number;
    failureCount: number;
    stateWriteError?: string | null;
    results: CheckResultItem[];
  } | null>(null);

  // 弹窗状态
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [syncDialog, setSyncDialog] = useState<{
    open: boolean;
    keyId: string | null;
    keyLabel: string;
  }>({
    open: false,
    keyId: null,
    keyLabel: "",
  });

  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);
  const [testingKeyModelId, setTestingKeyModelId] = useState<string | null>(null);

  // 诊断信息映射表：模型级失败按 keyModelId 对应；key 级失败回落到该渠道下所有模型。
  const diagnosticMap = useMemo(() => {
    const map: Record<string, ChannelFailureDiagnostic> = {};
    const keyDiagnostics = new Map<string, ChannelFailureDiagnostic>();
    for (const key of bundle?.keys ?? []) {
      if (key.failureDiagnostic) keyDiagnostics.set(key.id, key.failureDiagnostic);
    }
    for (const model of bundle?.models ?? []) {
      if (model.failureDiagnostic) {
        map[model.id] = model.failureDiagnostic;
      } else {
        const keyDiagnostic = keyDiagnostics.get(model.key_id);
        if (keyDiagnostic) map[model.id] = keyDiagnostic;
      }
    }
    return map;
  }, [bundle]);

  // 统一带确认执行命令
  const executeWithConfirm = useCallback(
    async (
      action: string,
      data: Record<string, unknown>,
      entity?: "provider" | "key" | "model" | "feature_binding",
      successMsg?: string | ((body: Record<string, unknown>) => string)
    ) => {
      const showSuccess = (body: Record<string, unknown>) => {
        if (!successMsg) return;
        feedbackToast.success(typeof successMsg === "function" ? successMsg(body) : successMsg);
      };
      const res = await runCommand(action, data, entity);
      if (res.ok) {
        showSuccess(res.body);
        return res;
      }

      if (res.status === 409 && res.requiresConfirmation) {
        setImpactConfirm({
          type: "impact",
          affectedBusinesses: res.affectedBusinesses || [],
          onConfirm: async () => {
            const retryRes = await runCommand(action, { ...data, confirm_impact: true }, entity);
            if (retryRes.ok) {
              showSuccess(retryRes.body);
            } else {
              feedbackToast.error(retryRes.error || "操作失败");
            }
          },
        });
        return res;
      }

      feedbackToast.error(res.error || "操作失败");
      return res;
    },
    [runCommand]
  );

  // S1: 检查一遍
  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    setDetectionState("idle");
    detectionRefreshRef.current?.stop();
    detectionRefreshRef.current = startDetectionRefresh({
      loadData,
      onWindowEnd: () => setDetectionState("stopped"),
      onReadError: () => feedbackToast.error("检测中最新状态读取失败，页面可能仍是旧数据。", { duration: 6000 }),
    });
    try {
      const res = await runCommand("check_all_in_use", {}, undefined, AI_MODEL_BATCH_TIMEOUT_MS);
      detectionRefreshRef.current?.stop();
      if (!res.ok) {
        feedbackToast.error(res.error || "执行检查失败");
        return;
      }
      const body = res.body as Record<string, unknown>;
      const rawCheck = (body.checkResult as Record<string, unknown>) || body;
      const total = (rawCheck.totalModels as number) ?? (rawCheck.total as number) ?? ((rawCheck.results as unknown[])?.length ?? 0);
      const successCount = (rawCheck.successCount as number) ?? 0;
      const failureCount = (rawCheck.failureCount as number) ?? 0;
      const results = (rawCheck.results as CheckResultItem[]) ?? [];
      const stateWriteError = (rawCheck.stateWriteError as string | null) ?? null;

      setCheckResult({ total, successCount, failureCount, results, stateWriteError });
      if (stateWriteError) {
        feedbackToast.error(`部分结果未能写入渠道状态：${stateWriteError}`, { duration: 6000 });
      }
      const finalReadOk = await loadData(true, true);
      if (!finalReadOk) {
        feedbackToast.error("最终状态未同步，请点击「重新读取最新状态」。", { duration: 6000 });
      }
    } catch (error) {
      setDetectionState("reading");
      feedbackToast.error(
        `检测未完整收齐：${error instanceof Error ? error.message : "请求中断"}。后台可能仍在完成，页面会自动读取已落库状态。`,
        { duration: 6000 },
      );
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleReloadAfterDetection = async () => {
    const ok = await loadData(true, true);
    if (ok) feedbackToast.success("已读取最新状态");
    else feedbackToast.error("读取失败，页面未同步最新状态", { duration: 6000 });
  };

  // 陷阱 A: 仅开关该供应
  const handleToggleSupply = async (keyModelId: string, enabled: boolean) => {
    await executeWithConfirm(
      "update",
      { id: keyModelId, is_enabled: enabled },
      "model",
      enabled ? "已开启该渠道对此模型的供应" : "已暂停该渠道对此模型的供应"
    );
  };

  // N4: 整个模型停用 / 恢复
  const handleToggleModelEnabled = async (modelId: string, enabled: boolean) => {
    await executeWithConfirm(
      "set_model_enabled",
      { model_id: modelId, is_enabled: enabled },
      undefined,
      (body) => {
        const changedSupplyCount = (body.shelfResult as { changedSupplyCount?: unknown } | undefined)
          ?.changedSupplyCount;
        return modelToggleSuccessMessage(
          enabled,
          typeof changedSupplyCount === "number" ? changedSupplyCount : undefined
        );
      }
    );
  };

  // 行内改名（禁止传 model_id）
  const handleRenameSupply = async (keyModelId: string, newName: string) => {
    await executeWithConfirm(
      "update",
      { id: keyModelId, display_name: newName },
      "model",
      "已更新渠道供应名称"
    );
  };

  // 顺位调整
  const handleSwapOrder = async (
    modelId: string,
    keyModelId: string,
    targetKeyModelId: string
  ) => {
    await executeWithConfirm(
      "swap_model_channel_order",
      {
        model_id: modelId,
        key_model_id: keyModelId,
        target_key_model_id: targetKeyModelId,
      },
      undefined,
      "已调整渠道顺位"
    );
  };

  // 单供应测试
  const handleTestSupply = async (keyId: string, modelId: string) => {
    const keyModelId = bundle?.models.find((m) => m.key_id === keyId && m.model_id === modelId)?.id;
    if (keyModelId) setTestingKeyModelId(keyModelId);
    try {
      const res = await runCommand("test_key_model", { key_id: keyId, model_id: modelId });
      if (!res.ok) {
        feedbackToast.error(`测试未通过: ${res.error || "服务异常"}`, { duration: 6000 });
        return;
      }
      const testRes = (res.body as Record<string, unknown>).testResult as
        | { ok?: boolean; message?: string; stateWriteError?: string | null }
        | undefined;
      if (testRes?.ok) {
        feedbackToast.success("测试通过，已恢复能用");
      } else {
        feedbackToast.error(`测试未通过: ${testRes?.message || "服务未返回测试结果"}`, { duration: 6000 });
        if (testRes?.stateWriteError) {
          feedbackToast.error(`测试结果未能写入渠道状态：${testRes.stateWriteError}`, { duration: 6000 });
        }
      }
    } finally {
      setTestingKeyModelId(null);
    }
  };

  // 删除单条供应
  const handleDeleteSupply = async (keyModelId: string) => {
    await executeWithConfirm(
      "remove_key_model",
      { key_model_id: keyModelId },
      undefined,
      "已移除此模型供应"
    );
  };

  // 开启候选供应
  const handleOpenSupply = async (keyId: string, modelId: string) => {
    return await runCommand("enable_model_channel", { key_id: keyId, model_id: modelId });
  };

  // 过滤后的模型系列列表
  // 进入模型视角时排一次：有业务在用 → 能用 → 暂时不可用 → 已停用；页面内操作期间位置不变
  const orderedFamilies = useFrozenOrder(
    report?.modelFamilies ?? [],
    (family) => family.modelId,
    compareModelFamilies(report?.businessAssurances ?? []),
    viewMode,
  );

  const filteredFamilies = useMemo(() => {
    let list = orderedFamilies;

    // D1: 只看在用 / 全部
    if (shelveFilter === "in_use") {
      list = list.filter((f) => f.isShelved);
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.displayName.toLowerCase().includes(q) ||
          f.modelId.toLowerCase().includes(q)
      );
    }

    return list;
  }, [orderedFamilies, shelveFilter, searchQuery]);

  return (
    <div className="space-y-3">
      {/* 顶部摘要与检查条 */}
      <ComputePoolHeader
        summary={
          report?.businessSummary || {
            normal: 0,
            fallback: 0,
            outage: 0,
            needsAttentionChannels: 0,
          }
        }
        onCheckAll={handleCheckAll}
        onOpenAddKey={() => setAddKeyOpen(true)}
        isChecking={isCheckingAll}
        checkResult={checkResult}
        onClearCheckResult={() => setCheckResult(null)}
      />

      {/* 检测未完整收齐：保留说明和手动重新读取入口 */}
      {detectionState !== "idle" && (
        <div
          data-slot="ai-detection-interrupted"
          className="rounded-xl border border-[#8A6A2F]/30 bg-[#8A6A2F]/[0.04] px-4 py-2 text-[12px] text-[#78716C] flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            {detectionState === "reading"
              ? "检测未完整收齐：请求已中断，后台可能仍在完成，正在读取已落库状态…"
              : "检测未完整收齐：已停止自动读取，后台可能仍在完成。请手动重新读取最新状态。"}
          </span>
          <Button
            size="s"
            variant="outline"
            onClick={handleReloadAfterDetection}
            className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            重新读取最新状态
          </Button>
        </div>
      )}

      {/* 合并后的筛选与视角切换工具行 */}
      <div
        data-slot="ai-pool-toolbar"
        className="sticky top-[var(--app-top-offset)] z-[var(--z-sticky-nav)] -mx-1 px-1 py-2 bg-[#FCFCFB]/85 backdrop-blur-md flex flex-wrap items-center gap-3"
      >
        <PoolViewSwitcher viewMode={viewMode} onChange={handleViewModeChange} />

        {viewMode === "model" && (
          <>
            {/* 只看在用 / 全部 切换 */}
            <div className="inline-flex items-center p-0.5 rounded-md bg-[#F1F1F0] text-[12px]">
              <button
                type="button"
                onClick={() => setShelveFilter("in_use")}
                className={cn(
                  "px-3 py-1 rounded-md transition-colors text-[12px]",
                  shelveFilter === "in_use"
                    ? "bg-white text-[#141413] shadow-input font-normal"
                    : "text-[#78716C] hover:text-[#141413]"
                )}
              >
                只看在用
              </button>
              <button
                type="button"
                onClick={() => setShelveFilter("all")}
                className={cn(
                  "px-3 py-1 rounded-md transition-colors text-[12px]",
                  shelveFilter === "all"
                    ? "bg-white text-[#141413] shadow-input font-normal"
                    : "text-[#78716C] hover:text-[#141413]"
                )}
              >
                全部模型 ({report?.modelFamilies.length ?? 0})
              </button>
            </div>

            {/* 搜索框 */}
            <div className="relative min-w-[220px] ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模型名称或标识..."
                className="h-8 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 模型视角内容 */}
      {viewMode === "model" && (
        <div className="space-y-3">
          {/* 模型卡列表 */}
          {filteredFamilies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E2E2DF] p-6 text-center text-[12px] text-[#78716C]">
              未找到匹配的模型。可切换至「全部模型」或调整搜索词。
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E2E2DF] bg-white divide-y divide-[#E2E2DF]">
              {filteredFamilies.map((family) => (
                <ModelFamilyCard
                  key={family.modelId}
                  family={family}
                  diagnosticMap={diagnosticMap}
                  onToggleSupply={handleToggleSupply}
                  onToggleModelEnabled={handleToggleModelEnabled}
                  onRenameSupply={handleRenameSupply}
                  onSwapOrder={handleSwapOrder}
                  onTestSupply={handleTestSupply}
                  onDeleteSupply={handleDeleteSupply}
                  onOpenSupply={handleOpenSupply}
                  runCommand={runCommand}
                  testingKeyModelId={testingKeyModelId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 渠道视角内容 */}
      {viewMode === "channel" && (
        <ChannelPoolView
          onOpenSyncModal={(keyId, label) =>
            setSyncDialog({ open: true, keyId, keyLabel: label })
          }
        />
      )}

      {/* 接入新渠道弹窗 */}
      <AddKeyDialog
        open={addKeyOpen}
        onOpenChange={setAddKeyOpen}
      />

      {/* 同步模型弹窗 */}
      <SyncModelsDialog
        open={syncDialog.open}
        onOpenChange={(open) => setSyncDialog((prev) => ({ ...prev, open }))}
        keyId={syncDialog.keyId}
        keyLabel={syncDialog.keyLabel}
      />

      {/* 统一高风险影响确认弹窗 */}
      <DangerousActionDialog
        state={impactConfirm}
        onClose={() => setImpactConfirm(null)}
      />
    </div>
  );
}
