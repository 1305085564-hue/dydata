"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { cn } from "@/lib/utils";

export type ViolationReviewStatus = "submitted" | "verified" | "rejected" | "archived";
export type ViolationRiskLevel = "high" | "medium" | "low" | null;

export interface ViolationReviewCase {
  id: string;
  createdAt: string;
  createdAtLabel: string;
  submitterName: string;
  scriptText: string;
  isViolation: boolean;
  category: string;
  accountName: string | null;
  teamName: string | null;
  sceneDescription: string | null;
  result: string | null;
  passCount: number;
  failCount: number;
  status: ViolationReviewStatus;
  riskLevel: ViolationRiskLevel;
  adminConclusion: string | null;
  suggestedAction: string | null;
  reviewedAt: string | null;
  reviewedAtLabel: string;
}

interface ReviewDraft {
  riskLevel: Exclude<ViolationRiskLevel, null>;
  adminConclusion: string;
  suggestedAction: string;
}

const RISK_OPTIONS: Array<{ value: ReviewDraft["riskLevel"]; label: string; className: string }> = [
  { value: "high", label: "高风险", className: "border-zinc-200 bg-[#C9604D]/10 text-[#C9604D]" },
  { value: "medium", label: "中风险", className: "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]" },
  { value: "low", label: "低风险", className: "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]" },
];

const STATUS_LABELS: Record<ViolationReviewStatus, string> = {
  submitted: "待复核",
  verified: "已确认",
  rejected: "已驳回",
  archived: "已归档",
};

function getInitialDraft(item: ViolationReviewCase): ReviewDraft {
  return {
    riskLevel: item.riskLevel ?? (item.isViolation ? "high" : "low"),
    adminConclusion: item.adminConclusion ?? "",
    suggestedAction: item.suggestedAction ?? "",
  };
}

function getStatusClassName(status: ViolationReviewStatus) {
  switch (status) {
    case "verified":
      return "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]";
    case "rejected":
      return "border-zinc-200 bg-zinc-100 text-zinc-600";
    case "archived":
      return "border-zinc-200 bg-zinc-50 text-zinc-400";
    default:
      return "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]";
  }
}

function ReviewCard({ item }: { item: ViolationReviewCase }) {
  const [draft, setDraft] = useState<ReviewDraft>(() => getInitialDraft(item));
  const [status, setStatus] = useState<ViolationReviewStatus>(item.status);
  const [isSaving, setIsSaving] = useState<"verified" | "rejected" | null>(null);

  const totalTests = item.passCount + item.failCount;
  const passRate = totalTests > 0 ? Math.round((item.passCount / totalTests) * 100) : null;

  async function submitReview(nextStatus: "verified" | "rejected") {
    if (!draft.adminConclusion.trim()) {
      feedbackToast.warning(nextStatus === "verified" ? "先填写管理员结论" : "先填写驳回原因");
      return;
    }

    const previousStatus = status;

    setStatus(nextStatus);
    setIsSaving(nextStatus);
    feedbackToast.success(nextStatus === "verified" ? "已确认案例" : "已驳回案例");
    try {
      const response = await fetch(`/api/violations/${item.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          risk_level: draft.riskLevel,
          admin_conclusion: draft.adminConclusion.trim(),
          suggested_action: draft.suggestedAction.trim(),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "复核接口暂时不可用"));
      }
    } catch (error) {
      setStatus(previousStatus);
      feedbackToast.error(error instanceof Error ? error.message : "复核失败");
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", getStatusClassName(status))}>
              {STATUS_LABELS[status]}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600">
              {item.isViolation ? "员工判断：违规" : "员工判断：可用"}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-500">
              {item.category}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-base font-semibold leading-7 text-zinc-800">{item.scriptText}</p>
        </div>
        <div className="shrink-0 text-left text-xs leading-6 text-zinc-500 lg:text-right">
          <p>提交人：{item.submitterName}</p>
          <p>时间：{item.createdAtLabel}</p>
          {item.reviewedAtLabel ? <p>复核：{item.reviewedAtLabel}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-zinc-50 p-3">
          <p className="text-xs text-zinc-400">账号</p>
          <p className="mt-1 font-medium text-zinc-800">{item.accountName ?? "未选择账号"}</p>
        </div>
        <div className="rounded-2xl bg-zinc-50 p-3">
          <p className="text-xs text-zinc-400">团队</p>
          <p className="mt-1 font-medium text-zinc-800">{item.teamName ?? "未关联团队"}</p>
        </div>
        <div className="rounded-2xl bg-zinc-50 p-3">
          <p className="text-xs text-zinc-400">测试结果</p>
          <p className="mt-1 font-medium text-zinc-800">
            {passRate === null ? "暂无测试" : `${passRate}% 通过（${item.passCount}/${totalTests}）`}
          </p>
        </div>
        <div className="rounded-2xl bg-zinc-50 p-3">
          <p className="text-xs text-zinc-400">结果描述</p>
          <p className="mt-1 line-clamp-2 font-medium text-zinc-800">{item.result || "未填写"}</p>
        </div>
      </div>

      {item.sceneDescription ? (
        <div className="mt-3 rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 text-sm leading-6 text-zinc-600">
          {item.sceneDescription}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-500">风险等级</p>
          <div className="grid gap-2">
            {RISK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, riskLevel: option.value }))}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                  draft.riskLevel === option.value ? option.className : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-zinc-500">管理员结论</span>
          <Textarea
            value={draft.adminConclusion}
            onChange={(event) => setDraft((current) => ({ ...current, adminConclusion: event.target.value }))}
            placeholder="例如：公司层面禁止这类导粉话术"
            className="min-h-32 rounded-2xl bg-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-zinc-500">建议动作</span>
          <Textarea
            value={draft.suggestedAction}
            onChange={(event) => setDraft((current) => ({ ...current, suggestedAction: event.target.value }))}
            placeholder="例如：删除敏感词，改成评论区引导"
            className="min-h-32 rounded-2xl bg-zinc-50"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={Boolean(isSaving)} onClick={() => submitReview("rejected")}>
          {isSaving === "rejected" ? <Skeleton className="size-4 rounded" /> : <CircleSlash2 className="size-4 stroke-[1.5]" />}
          驳回
        </Button>
        <Button type="button" disabled={Boolean(isSaving)} onClick={() => submitReview("verified")}>
          {isSaving === "verified" ? <Skeleton className="size-4 rounded" /> : <CheckCircle2 className="size-4 stroke-[1.5]" />}
          确认
        </Button>
      </div>
    </article>
  );
}

export function ViolationsReviewList({ cases }: { cases: ViolationReviewCase[] }) {
  const pendingCases = useMemo(() => cases.filter((item) => item.status === "submitted").length, [cases]);

  if (cases.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <p className="text-[14px] font-medium text-zinc-800">暂无需要显示的案例</p>
        <p className="mt-2 text-[13px] leading-[1.7] text-zinc-500">切换到全部状态，或等待员工提交新的违规话术案例。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">复核列表</h2>
        <p className="text-[13px] text-zinc-500">当前列表待复核 <span className="font-mono tabular-nums">{pendingCases}</span> 条</p>
      </div>
      {cases.map((item) => (
        <ReviewCard key={item.id} item={item} />
      ))}
    </section>
  );
}
