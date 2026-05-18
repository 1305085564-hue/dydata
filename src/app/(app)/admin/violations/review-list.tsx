"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleSlash2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { cn } from "@/lib/utils";

// TODO-SPRINT4-任务3：驳回模板原因
const REJECT_TEMPLATES = [
  { id: "incomplete", label: "资料不全", text: "提交的资料不完整，请补充后重新提交" },
  { id: "unclear", label: "证据不清晰", text: "截图/证据不清晰，请重新上传" },
  { id: "wrong_category", label: "分类错误", text: "案例分类选择错误，请核对后重新提交" },
  { id: "duplicate", label: "重复提交", text: "该案例已存在，请勿重复提交" },
  { id: "other", label: "其他原因", text: "" },
] as const;

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

interface StoredDraft {
  riskLevel: Exclude<ViolationRiskLevel, null>;
  adminConclusion: string;
  suggestedAction: string;
  savedAt: number;
}

function getDraftKey(caseId: string): string {
  return `dydata.draft.review.${caseId}`;
}

function loadStoredDraft(caseId: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getDraftKey(caseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed.riskLevel || typeof parsed.adminConclusion !== "string" || typeof parsed.suggestedAction !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredDraft(caseId: string, draft: ReviewDraft): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(getDraftKey(caseId), JSON.stringify(stored));
  } catch {
    // localStorage 可能已满，静默失败
  }
}

function clearStoredDraft(caseId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getDraftKey(caseId));
  } catch {
    // 忽略
  }
}

function formatSavedAt(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
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
  const [draft, setDraft] = useState<ReviewDraft>(() => {
    const stored = loadStoredDraft(item.id);
    if (stored) {
      return {
        riskLevel: stored.riskLevel,
        adminConclusion: stored.adminConclusion,
        suggestedAction: stored.suggestedAction,
      };
    }
    return getInitialDraft(item);
  });
  const [status, setStatus] = useState<ViolationReviewStatus>(item.status);
  const [isSaving, setIsSaving] = useState<"verified" | "rejected" | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(() => {
    const stored = loadStoredDraft(item.id);
    return stored?.savedAt ?? null;
  });
  const [showRejectTemplate, setShowRejectTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const totalTests = item.passCount + item.failCount;
  const passRate = totalTests > 0 ? Math.round((item.passCount / totalTests) * 100) : null;

  // 页面加载后如果 item 状态已变（非 submitted），清除草稿
  useEffect(() => {
    if (item.status !== "submitted") {
      clearStoredDraft(item.id);
      setSavedAt(null);
    }
  }, [item.status, item.id]);

  function handleSaveDraft() {
    saveStoredDraft(item.id, draft);
    setSavedAt(Date.now());
    feedbackToast.success("已暂存草稿");
  }

  function handleRestoreDraft() {
    const stored = loadStoredDraft(item.id);
    if (!stored) return;
    setDraft({
      riskLevel: stored.riskLevel,
      adminConclusion: stored.adminConclusion,
      suggestedAction: stored.suggestedAction,
    });
    feedbackToast.success("草稿已恢复");
  }

  function handleSelectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = REJECT_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setDraft((current) => ({ ...current, adminConclusion: template.text }));
    }
  }

  async function submitReview(nextStatus: "verified" | "rejected") {
    if (!draft.adminConclusion.trim()) {
      feedbackToast.warning(nextStatus === "verified" ? "先填写管理员结论" : "先填写驳回原因");
      return;
    }

    const previousStatus = status;

    setStatus(nextStatus);
    setIsSaving(nextStatus);
    clearStoredDraft(item.id);
    setSavedAt(null);
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
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[18px] font-semibold leading-7 text-zinc-800">
            {item.scriptText}
          </p>
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
        <div className="mt-3 max-h-32 overflow-y-auto rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 text-sm leading-6 text-zinc-600">
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
          {showRejectTemplate ? (
            <div className="mb-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 outline-none"
              >
                <option value="">选择驳回原因模板（可选）</option>
                {REJECT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Textarea
            value={draft.adminConclusion}
            onChange={(event) => setDraft((current) => ({ ...current, adminConclusion: event.target.value }))}
            placeholder={showRejectTemplate ? "可继续编辑驳回原因" : "例如：公司层面禁止这类导粉话术"}
            className="max-h-48 min-h-32 overflow-y-auto rounded-2xl bg-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-zinc-500">建议动作</span>
          <Textarea
            value={draft.suggestedAction}
            onChange={(event) => setDraft((current) => ({ ...current, suggestedAction: event.target.value }))}
            placeholder="例如：删除敏感词，改成评论区引导"
            className="max-h-48 min-h-32 overflow-y-auto rounded-2xl bg-zinc-50"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {savedAt && status === "submitted" ? (
          <span className="mr-auto text-[12px] text-zinc-400">
            上次暂存于 {formatSavedAt(savedAt)}
          </span>
        ) : null}
        {savedAt && status === "submitted" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={Boolean(isSaving)}
            onClick={handleRestoreDraft}
            className="h-8 text-[12px] text-zinc-500 hover:text-zinc-800"
          >
            <RotateCcw className="mr-1 size-3.5" />
            恢复草稿
          </Button>
        ) : null}
        {status === "submitted" ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={Boolean(isSaving)}
            onClick={handleSaveDraft}
            className="h-8 text-[12px]"
          >
            暂存
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(isSaving)}
          onClick={() => {
            if (!showRejectTemplate) {
              setShowRejectTemplate(true);
            }
            submitReview("rejected");
          }}
        >
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
