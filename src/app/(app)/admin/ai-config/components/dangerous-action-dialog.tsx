"use client";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type DangerousActionType =
  | "disable_provider"
  | "delete_provider"
  | "delete_key"
  | "unshelf_model"
  | "unmount_model"
  | "batch_enable_models";

export type DangerousActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: DangerousActionType;
  targetName: string;
  loading?: boolean;
  preview: {
    ok: boolean;
    complete: boolean;
    unknownReasons: string[];
    scope?: "provider" | "key" | "model";
    channels?: Array<{
      id: string;
      name: string;
      providerName: string;
      models: Array<{ modelId: string; displayName: string | null; isEnabled: boolean; isGloballyEnabled: boolean | null }>;
      businessFunctions: Array<{ key: string; label: string }>;
    }>;
    businessFunctions?: Array<{ key: string; label: string }>;
    remainingAvailableLineCount?: number;
    soleBusinessFunctions?: Array<{ key: string; label: string }>;
    criticalBindings?: Array<{ id: string; key: string; label: string; modelId: string | null }>;
    affectedBindings?: Array<{ id: string; key: string; label: string; modelId: string | null }>;
  } | null;
  onConfirm: () => void | Promise<void>;
  onNarrowerAction?: () => void | Promise<void>;
  narrowerActionLabel?: string;
  narrowerActionDescription?: string;
  confirmButtonLabel?: string;
  isExecuting?: boolean;
};

const ACTION_TITLES: Record<DangerousActionType, string> = {
  disable_provider: "停用接入点确认",
  delete_provider: "删除接入点确认",
  delete_key: "删除渠道确认",
  unshelf_model: "全站下架模型确认",
  unmount_model: "收走模型供应确认",
  batch_enable_models: "批量启用模型确认",
};

const ACTION_DESCRIPTIONS: Record<DangerousActionType, (name: string) => string> = {
  disable_provider: (name) => `停用接入点「${name}」将导致其下所有挂载的渠道立即停止对外提供模型服务。`,
  delete_provider: (name) => `彻底删除接入点「${name}」将级联清除该接入点下的所有渠道、挂载模型及配置，此操作不可撤销。`,
  delete_key: (name) => `彻底删除渠道「${name}」将清除该渠道与所有挂载模型，此操作不可撤销。`,
  unshelf_model: (name) => `全站下架模型「${name}」后，所有业务调度将无法解析并使用该模型。各渠道的挂载供应将保留原状。`,
  unmount_model: (name) => `收走渠道上的模型「${name}」将清除此渠道提供该模型的供应记录。`,
  batch_enable_models: () => "即将跨渠道批量启用多个模型，请确认对现有调度与业务保障的影响。",
};

export function DangerousActionDialog({
  open,
  onOpenChange,
  actionType,
  targetName,
  loading = false,
  preview,
  onConfirm,
  onNarrowerAction,
  narrowerActionLabel,
  narrowerActionDescription,
  confirmButtonLabel = "确认执行",
  isExecuting = false,
}: DangerousActionDialogProps) {
  const title = ACTION_TITLES[actionType] || "高风险动作确认";
  const desc = ACTION_DESCRIPTIONS[actionType]?.(targetName) || "";

  const isBlocked = !preview || !preview.complete || (preview.unknownReasons && preview.unknownReasons.length > 0);
  const criticalBindings = preview?.criticalBindings ?? [];
  const channels = preview?.channels ?? [];
  const businessFunctions = preview?.businessFunctions ?? [];
  const hasCriticalBindings = criticalBindings.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[94vw] max-w-xl flex-col rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
        <DialogHeader className="gap-1.5 border-b border-[#E2E2DF]/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#C0685C]/10 text-[#C0685C]">
              <ShieldAlert className="size-4" />
            </div>
            <DialogTitle className="text-[18px] font-medium text-[#141413]">{title}</DialogTitle>
          </div>
          <p className="text-[12px] text-[#78716C] leading-relaxed">{desc}</p>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#78716C]">
              <Loader2 className="size-5 animate-spin text-[#D97757]" />
              <span className="text-[13px]">正在深度核查关联业务依赖与渠道资源…</span>
            </div>
          ) : isBlocked ? (
            /* 无法确认完整依赖：一律阻断（冻结裁决③） */
            <div className="rounded-xl border border-[#C0685C]/25 bg-[#C0685C]/8 p-4 space-y-2.5 text-[12px] text-[#C0685C]">
              <div className="flex items-center gap-1.5 font-medium text-[13px]">
                <AlertCircle className="size-4 shrink-0" />
                <span>无法确定影响范围（系统已默认拦截执行）</span>
              </div>
              <p className="text-[12px] text-[#1F1E1D] leading-relaxed">
                系统检测到以下渠道尚未成功同步模型或上游数据缺失，在确认全部供给关系前，禁止执行该操作，以防线上业务静默断供：
              </p>
              <ul className="space-y-1.5 pl-4 list-disc text-[12px] text-[#C0685C]">
                {preview?.unknownReasons && preview.unknownReasons.length > 0 ? (
                  preview.unknownReasons.map((reason, index) => (
                    <li key={index} className="leading-relaxed">{reason}</li>
                  ))
                ) : (
                  <li>未返回完整的依赖链数据，无法安全核算破坏半径。</li>
                )}
              </ul>
              <p className="text-[12px] text-[#78716C] pt-1">
                解决建议：请先前往对应渠道点击「同步模型」，拉取上游完整清单后再试。
              </p>
            </div>
          ) : (
            /* 依赖核查通过，完整展示牵连对象真实名称 */
            <div className="space-y-3.5">
              {/* 独占/严重断供警告 */}
              {hasCriticalBindings && (
                <div className="rounded-xl border border-[#C0685C]/30 bg-[#C0685C]/10 p-3.5 space-y-2 text-[12px]">
                  <div className="flex items-center gap-1.5 font-medium text-[#C0685C] text-[13px]">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>严重断供风险：以下业务将失去唯一可用模型供给</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {criticalBindings.map((cb) => (
                      <span
                        key={cb.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-[#C0685C]/30 text-[#C0685C] font-medium text-[12px]"
                      >
                        {cb.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[#C0685C]/90 text-[12px]">
                    此操作将使上述业务完全无可用算力，后端将直接拦截（409 冲突）。请先为这些业务配置备用模型。
                  </p>
                </div>
              )}

              {/* 涉及的业务功能 */}
              {businessFunctions.length > 0 && !hasCriticalBindings && (
                <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-3 space-y-1.5">
                  <span className="text-[12px] font-medium text-[#141413]">
                    直接受影响的业务功能（共 {businessFunctions.length} 项）：
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {businessFunctions.map((bf) => (
                      <span
                        key={bf.key}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-[#E2E2DF] text-[#1F1E1D] text-[12px]"
                      >
                        {bf.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 牵连的渠道真实名单（逐条列出，禁止折叠） */}
              {channels.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[12px] font-medium text-[#141413]">
                    牵连的渠道与模型明细：
                  </span>
                  <div className="rounded-xl border border-[#E2E2DF] divide-y divide-[#E2E2DF]/60 bg-[#FCFCFB] overflow-hidden">
                    {channels.map((ch) => (
                      <div key={ch.id} className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-[#141413]">
                            渠道：{ch.name}
                          </span>
                          <span className="text-[12px] text-[#78716C]">
                            接入点：{ch.providerName}
                          </span>
                        </div>
                        {ch.models && ch.models.length > 0 && (
                          <div className="text-[12px] text-[#78716C] flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#A8A29E]">挂载模型:</span>
                            {ch.models.map((m) => (
                              <span
                                key={m.modelId}
                                className={cn(
                                  "font-mono text-[12px] px-1.5 py-0.2 rounded border",
                                  m.isEnabled
                                    ? "bg-white border-[#E2E2DF] text-[#1F1E1D]"
                                    : "bg-[#EBEBE9] border-transparent text-[#78716C]"
                                )}
                              >
                                {m.displayName || m.modelId}
                                {!m.isEnabled && " (已停)"}
                              </span>
                            ))}
                          </div>
                        )}
                        {ch.businessFunctions && ch.businessFunctions.length > 0 && (
                          <div className="text-[12px] text-[#78716C]">
                            已绑定业务：{ch.businessFunctions.map((bf) => bf.label).join("、")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 模型视角下架/收走时剩余可用渠道说明 */}
              {preview?.remainingAvailableLineCount !== undefined && (
                <div className="rounded-xl border border-[#E2E2DF] bg-white p-3 text-[12px] text-[#78716C] flex items-center justify-between">
                  <span>该模型在其他渠道的剩余可用线路：</span>
                  <span className="font-mono font-medium text-[#141413]">
                    {preview.remainingAvailableLineCount} 条可用
                  </span>
                </div>
              )}

              {/* 更窄的替代方案（冻结裁决③：必须提供，不能只给确定/取消） */}
              {onNarrowerAction && narrowerActionLabel && (
                <div className="rounded-xl border border-[#D97757]/20 bg-[#D97757]/5 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#D97757]">
                    <span>💡 更窄的替代操作（推荐）：</span>
                  </div>
                  <p className="text-[12px] text-[#78716C] leading-relaxed">
                    {narrowerActionDescription || "如果你只需要调整单条渠道或保留配置数据，建议使用更小影响范围的操作："}
                  </p>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="s"
                      onClick={() => void onNarrowerAction()}
                      disabled={isExecuting}
                      className="h-7 text-[12px] border-[#D97757]/40 text-[#D97757] hover:bg-[#D97757]/10 hover:text-[#D97757]"
                    >
                      {narrowerActionLabel}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="s"
            onClick={() => onOpenChange(false)}
            disabled={isExecuting}
            className="h-7.5 px-3 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>

          <Button
            type="button"
            size="s"
            onClick={() => void onConfirm()}
            disabled={isBlocked || hasCriticalBindings || isExecuting}
            className={cn(
              "h-7.5 px-3.5 text-[12px] font-normal text-white shadow-input",
              actionType.startsWith("delete") || actionType.startsWith("unmount")
                ? "bg-[#C0685C] hover:bg-[#C0685C]/90"
                : "bg-[#D97757] hover:bg-[#D97757]/90",
              (isBlocked || hasCriticalBindings) && "opacity-50 cursor-not-allowed bg-[#A8A29E] hover:bg-[#A8A29E]"
            )}
          >
            {isExecuting ? "正在执行…" : confirmButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
