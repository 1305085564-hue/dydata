"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash2,
  ShieldAlert,
  Sparkles,
  TestTube2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { trackUsageEvent } from "@/lib/usage-events/client";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { cn } from "@/lib/utils";

type Decision = "verify" | "reject";
type UsageState = "available" | "testing" | "not_recommended" | "banned";
type RiskLevel = "high" | "medium" | "low";
type PromotionLevel = "promoted" | "normal";
type CasePurpose = "violation" | "conversion";

type ReasonTag = {
  id: string;
  name: string;
  sort_order?: number;
};

const VIOLATION_USAGE_OPTIONS: Array<{
  value: UsageState;
  label: string;
  hint: string;
  dotColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "available",
    label: "可用",
    hint: "团队可放心使用",
    dotColor: "#6FAA7D",
    icon: CheckCircle2,
  },
  {
    value: "testing",
    label: "待测试",
    hint: "样本不足，需谨慎试用",
    dotColor: "#D99E55",
    icon: TestTube2,
  },
  {
    value: "not_recommended",
    label: "× 推荐",
    hint: "效果差，× 优先用",
    dotColor: "#78716C",
    icon: CircleDashed,
  },
  {
    value: "banned",
    label: "禁用",
    hint: "已确认违规，团队全员避开",
    dotColor: "#C9604D",
    icon: ShieldAlert,
  },
];

const CONVERSION_USAGE_OPTIONS: Array<{
  value: UsageState;
  label: string;
  hint: string;
  dotColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "available",
    label: "可用",
    hint: "效果稳，团队可放心复用",
    dotColor: "#6FAA7D",
    icon: CheckCircle2,
  },
  {
    value: "testing",
    label: "待测试",
    hint: "样本不足，先小范围跑",
    dotColor: "#D99E55",
    icon: TestTube2,
  },
  {
    value: "not_recommended",
    label: "× 推荐",
    hint: "效果差，× 优先用",
    dotColor: "#78716C",
    icon: CircleDashed,
  },
];

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string; dotColor: string }> = [
  { value: "high", label: "高风险", dotColor: "#C9604D" },
  { value: "medium", label: "中风险", dotColor: "#D99E55" },
  { value: "low", label: "低风险", dotColor: "#6FAA7D" },
];

const VIOLATION_REJECT_TEMPLATES = [
  { id: "incomplete", label: "资料不全", text: "提交的资料不完整，请补充截图/平台通知后重新提交。" },
  { id: "unclear", label: "证据 × 清晰", text: "截图/通知文本 × 清晰，请重新上传。" },
  { id: "no_notice", label: "缺通知", text: "缺平台处罚通知文本，无法判定违规点。" },
  { id: "duplicate", label: "重复提交", text: "该案例已存在，请勿重复提交。" },
] as const;

const CONVERSION_REJECT_TEMPLATES = [
  { id: "duplicate", label: "重复话术", text: "知识库已有同款话术，请勿重复提交。" },
  { id: "off_topic", label: "× 适合", text: "该话术 × 适合公司业务方向，× 入库。" },
  { id: "low_quality", label: "效果待验证", text: "话术质量一般，建议先自己跑出数据再提交。" },
  { id: "incomplete", label: "证据不足", text: "请补充使用截图或具体使用场景说明。" },
] as const;

interface Props {
  caseId: string;
  purpose?: CasePurpose;
  initialStatus: "submitted" | "verified" | "rejected" | "archived" | string;
  initialUsageState?: UsageState | string | null;
  initialRiskLevel?: RiskLevel | string | null;
  initialPromotionLevel?: PromotionLevel | string | null;
  initialAdminConclusion?: string | null;
  initialSuggestedAction?: string | null;
  initialReasonTagIds?: string[];
  isOwner: boolean;
  /** 审核保存成功后的回调（用于让外层 Dialog 自行关闭）；不传则只 router.refresh */
  onSuccess?: () => void;
  highlightedSections?: string[];
}

function asUsageState(value: string | null | undefined, purpose: CasePurpose): UsageState {
  if (value === "available" || value === "testing" || value === "not_recommended") return value;
  if (value === "banned" && purpose === "violation") return value;
  return "testing";
}

function asRiskLevel(value: string | null | undefined): RiskLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

export function ReviewDecisionPanel({
  caseId,
  purpose = "violation",
  initialStatus,
  initialUsageState,
  initialRiskLevel,
  initialPromotionLevel,
  initialAdminConclusion,
  initialSuggestedAction,
  initialReasonTagIds,
  isOwner,
  onSuccess,
  highlightedSections,
}: Props) {
  const router = useRouter();
  const isViolation = purpose === "violation";
  const usageOptions = isViolation ? VIOLATION_USAGE_OPTIONS : CONVERSION_USAGE_OPTIONS;
  const rejectTemplates = isViolation ? VIOLATION_REJECT_TEMPLATES : CONVERSION_REJECT_TEMPLATES;
  const initialDecision: Decision | null = useMemo(() => {
    if (initialStatus === "verified") return "verify";
    if (initialStatus === "rejected") return "reject";
    return null;
  }, [initialStatus]);

  const [decision, setDecision] = useState<Decision | null>(initialDecision);
  const [usageState, setUsageState] = useState<UsageState>(asUsageState(initialUsageState, purpose));
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(asRiskLevel(initialRiskLevel));
  const [promote, setPromote] = useState<boolean>(initialPromotionLevel === "promoted");
  const [conclusion, setConclusion] = useState(initialAdminConclusion ?? "");
  const [action, setAction] = useState(initialSuggestedAction ?? "");
  const [reasonTagIds, setReasonTagIds] = useState<string[]>(initialReasonTagIds ?? []);
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(isViolation);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isViolation) {
      setIsLoadingTags(false);
      return;
    }
    let aborted = false;
    (async () => {
      try {
        const response = await fetch("/api/conversion-hub/reason-tags", { method: "GET" });
        if (!response.ok) throw new Error("加载踩雷点标签失败");
        const payload: unknown = await response.json().catch(() => ({}));
        if (aborted) return;
        const list = (payload as { data?: unknown }).data;
        if (Array.isArray(list)) {
          const parsed = list.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const row = item as { id?: unknown; name?: unknown; sort_order?: unknown };
            if (typeof row.id !== "string" || typeof row.name !== "string") return [];
            return [{
              id: row.id,
              name: row.name,
              sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
            }];
          });
          setReasonTags(parsed);
        }
      } catch {
        // 静默失败：标签加载失败不阻塞审核
      } finally {
        if (!aborted) setIsLoadingTags(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [isViolation]);

  function applyTemplate(id: string) {
    const tpl = rejectTemplates.find((t) => t.id === id);
    if (tpl) setConclusion(tpl.text);
  }

  function toggleReasonTag(id: string) {
    setReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    );
  }

  async function submit() {
    if (!decision) {
      feedbackToast.warning("请先选采纳或驳回");
      return;
    }
    if (!conclusion.trim()) {
      feedbackToast.warning(decision === "verify" ? "先填写管理员结论" : "先填写驳回原因");
      return;
    }

    setSubmitting(true);
    try {
      const promotionLevel: PromotionLevel | undefined =
        decision === "verify" && usageState === "available" && isOwner && promote
          ? "promoted"
          : undefined;

      const payload: Record<string, unknown> = {
        status: decision === "verify" ? "verified" : "rejected",
        risk_level: isViolation ? riskLevel : null,
        admin_conclusion: conclusion.trim(),
        suggested_action: action.trim() || null,
      };
      if (isViolation) {
        payload.reason_tag_ids = reasonTagIds;
        if (highlightedSections) {
          payload.highlighted_sections = highlightedSections;
        }
      }
      if (decision === "verify") {
        payload.usage_state = usageState;
        if (promotionLevel) payload.promotion_level = promotionLevel;
        else payload.promotion_level = "normal";
      } else if (isViolation) {
        payload.usage_state = "banned";
      }

      const response = await fetch(`/api/violations/${caseId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiErrorMessage(result, "审核失败"));

      trackUsageEvent({ path: "/violations/[id]", eventType: "review_violation_case" });
      feedbackToast.success(decision === "verify" ? (isViolation ? "已采纳并落库" : "已入库，团队可复用") : "已驳回");
      router.refresh();
      onSuccess?.();
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "审核失败");
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = initialStatus === "archived";
  const showReasonTags = decision !== null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <header className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-[#D97757]" />
        <h2 className="text-[18px] font-medium leading-[1.6] text-stone-900">审核决策</h2>
        <span className="text-[12px] text-stone-500">
          {initialStatus === "submitted"
            ? "员工等你判断能否纳入知识库"
            : initialStatus === "verified"
              ? "已采纳，可调整状态后重新保存"
              : initialStatus === "rejected"
                ? "已驳回，可重新审核"
                : "已归档案例 × 可修改"}
        </span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <DecisionPill
          active={decision === "verify"}
          onClick={() => setDecision("verify")}
          icon={CheckCircle2}
          label="采纳"
          tone="positive"
        />
        <DecisionPill
          active={decision === "reject"}
          onClick={() => setDecision("reject")}
          icon={CircleSlash2}
          label="驳回"
          tone="danger"
        />
      </div>

      {decision === "verify" ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[12px] font-normal text-stone-500">使用状态</p>
            <div
              className={cn(
                "mt-2 grid grid-cols-2 gap-2",
                usageOptions.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
              )}
            >
              {usageOptions.map((option) => {
                const Icon = option.icon;
                const active = usageState === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUsageState(option.value)}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors active:translate-y-0",
                      active
                        ? "border-stone-300 bg-stone-50 text-stone-700"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />
                    <div className="leading-tight">
                      <p className="text-[13px] font-medium">{option.label}</p>
                      <p className="text-[12px] text-stone-500">{option.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {isViolation ? (
            <div>
              <p className="text-[12px] font-normal text-stone-500">风险等级</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RISK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRiskLevel(option.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors active:translate-y-0",
                      riskLevel === option.value
                        ? "border-stone-300 bg-stone-50 text-stone-700"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700",
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: option.dotColor }} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isOwner && usageState === "available" ? (
            <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5 text-[13px] text-stone-700">
              <input
                type="checkbox"
                checked={promote}
                onChange={(event) => setPromote(event.target.checked)}
                className="size-4 rounded border-stone-300 accent-[#D97757]"
              />
              <Sparkles className="size-4 stroke-[1.5] text-[#3F7A4E]" />
              <span className="font-medium">同时置顶推荐</span>
              <span className="text-[12px] text-stone-500">仅 Owner 可推广，会出现在员工推荐 banner</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {decision === "reject" ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[12px] font-normal text-stone-500">驳回原因模板</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rejectTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[12px] font-medium text-stone-700 transition-colors hover:border-stone-300 hover:text-stone-900 active:translate-y-0"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
          {isViolation ? (
            <div>
              <p className="text-[12px] font-normal text-stone-500">风险等级</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RISK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRiskLevel(option.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors active:translate-y-0",
                      riskLevel === option.value
                        ? "border-stone-300 bg-stone-50 text-stone-700"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700",
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: option.dotColor }} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showReasonTags && isViolation ? (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-normal text-stone-500">踩雷点标签</p>
            {reasonTagIds.length > 0 ? (
              <span className="text-[12px] text-stone-500">已选 {reasonTagIds.length}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-stone-500">告诉员工是因为踩到哪些雷被处罚的。可多选。</p>
          {isLoadingTags ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-7 w-16 rounded-full bg-stone-100" />
              ))}
            </div>
          ) : reasonTags.length === 0 ? (
            <p className="mt-2 text-[12px] text-stone-500">暂无可选标签，请联系管理员配置</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {reasonTags.map((tag) => {
                const active = reasonTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleReasonTag(tag.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors active:translate-y-0",
                      active
                        ? "border-[#D97757]/40 text-[#B4532F]"
                        : "border-stone-200 text-stone-700 hover:border-stone-300 hover:text-stone-900",
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {decision ? (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[12px] font-normal text-stone-500">
              {decision === "verify" ? "管理员结论" : "驳回原因"}
              <span className="ml-1 text-[#B24E3E]">*</span>
            </span>
            <Textarea
              value={conclusion}
              onChange={(event) => setConclusion(event.target.value)}
              placeholder={
                decision === "verify"
                  ? "例如：经实测在多个账号有效，纳入团队可用话术"
                  : "例如：截图 × 清晰，请补充原始素材"
              }
              className="mt-1.5 min-h-[80px] rounded-xl bg-stone-50/60"
            />
          </label>

          {decision === "verify" ? (
            <label className="block">
              <span className="text-[12px] font-normal text-stone-500">建议动作（选填）</span>
              <Textarea
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="例如：发布前提醒队员把敏感词替换为评论区引导"
                className="mt-1.5 min-h-[60px] rounded-xl bg-stone-50/60"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {decision ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-stone-500">
            {decision === "verify"
              ? "保存后员工立刻能在话术库看到"
              : "保存后此提交从员工列表移除，员工可重新提交"}
          </p>
          <Button
            type="button"
            disabled={submitting || isLocked}
            onClick={submit}
            className="rounded-lg bg-[#B4532F] px-5 text-white hover:bg-[#A84D2B] active:translate-y-0"
          >
            {submitting ? "保存中..." : decision === "verify" ? "保存并采纳" : "保存并驳回"}
          </Button>
        </div>
      ) : null}

      {isLocked ? (
        <p className="mt-4 inline-flex items-center gap-2 text-[12px] text-stone-500">
          <AlertTriangle className="size-3.5 stroke-[1.5]" />
          已归档案例 × 可修改，请先取消归档
        </p>
      ) : null}
    </section>
  );
}

function DecisionPill({
  active,
  onClick,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "positive" | "danger";
}) {
  const dotColor = tone === "positive" ? "#6FAA7D" : "#C9604D";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border px-4 text-[13px] font-normal transition-colors active:translate-y-0",
        active
          ? "border-stone-300 bg-stone-50 text-stone-700"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700",
      )}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: active ? dotColor : "transparent" }} />
      <Icon className="size-4 stroke-[1.5]" />
      {label}
    </button>
  );
}
