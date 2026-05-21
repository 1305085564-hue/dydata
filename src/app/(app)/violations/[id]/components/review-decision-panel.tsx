"use client";

import { useMemo, useState } from "react";
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
import { getApiErrorMessage } from "@/lib/violations/errors";
import { cn } from "@/lib/utils";

type Decision = "verify" | "reject";
type UsageState = "available" | "testing" | "not_recommended" | "banned";
type RiskLevel = "high" | "medium" | "low";
type PromotionLevel = "promoted" | "normal";

const USAGE_OPTIONS: Array<{
  value: UsageState;
  label: string;
  hint: string;
  tone: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "available",
    label: "可用",
    hint: "团队可放心使用",
    tone: "border-[#5C8AB8]/30 bg-[#5C8AB8]/10 text-[#3F668F]",
    icon: CheckCircle2,
  },
  {
    value: "testing",
    label: "待测试",
    hint: "样本不足，需谨慎试用",
    tone: "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757]",
    icon: TestTube2,
  },
  {
    value: "not_recommended",
    label: "× 推荐",
    hint: "效果差，× 优先用",
    tone: "border-zinc-300 bg-zinc-100 text-zinc-600",
    icon: CircleDashed,
  },
  {
    value: "banned",
    label: "禁用",
    hint: "已确认违规，团队全员避开",
    tone: "border-[#C9604D]/30 bg-[#C9604D]/10 text-[#C9604D]",
    icon: ShieldAlert,
  },
];

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string; tone: string }> = [
  { value: "high", label: "高风险", tone: "border-[#C9604D]/30 bg-[#C9604D]/10 text-[#C9604D]" },
  { value: "medium", label: "中风险", tone: "border-[#D99E55]/30 bg-[#D99E55]/10 text-[#D99E55]" },
  { value: "low", label: "低风险", tone: "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]" },
];

const REJECT_TEMPLATES = [
  { id: "incomplete", label: "资料不全", text: "提交的资料不完整，请补充截图/场景描述后重新提交。" },
  { id: "unclear", label: "证据 × 清晰", text: "截图/证据 × 清晰，请重新上传。" },
  { id: "wrong_category", label: "分类错误", text: "案例分类选择错误，请核对后重新提交。" },
  { id: "duplicate", label: "重复提交", text: "该案例已存在，请勿重复提交。" },
] as const;

interface Props {
  caseId: string;
  initialStatus: "submitted" | "verified" | "rejected" | "archived" | string;
  initialUsageState?: UsageState | string | null;
  initialRiskLevel?: RiskLevel | string | null;
  initialPromotionLevel?: PromotionLevel | string | null;
  initialAdminConclusion?: string | null;
  initialSuggestedAction?: string | null;
  isOwner: boolean;
}

function asUsageState(value: string | null | undefined): UsageState {
  if (value === "available" || value === "testing" || value === "not_recommended" || value === "banned") {
    return value;
  }
  return "testing";
}

function asRiskLevel(value: string | null | undefined): RiskLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

export function ReviewDecisionPanel({
  caseId,
  initialStatus,
  initialUsageState,
  initialRiskLevel,
  initialPromotionLevel,
  initialAdminConclusion,
  initialSuggestedAction,
  isOwner,
}: Props) {
  const router = useRouter();
  const initialDecision: Decision | null = useMemo(() => {
    if (initialStatus === "verified") return "verify";
    if (initialStatus === "rejected") return "reject";
    return null;
  }, [initialStatus]);

  const [decision, setDecision] = useState<Decision | null>(initialDecision);
  const [usageState, setUsageState] = useState<UsageState>(asUsageState(initialUsageState));
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(asRiskLevel(initialRiskLevel));
  const [promote, setPromote] = useState<boolean>(initialPromotionLevel === "promoted");
  const [conclusion, setConclusion] = useState(initialAdminConclusion ?? "");
  const [action, setAction] = useState(initialSuggestedAction ?? "");
  const [submitting, setSubmitting] = useState(false);

  function applyTemplate(id: string) {
    const tpl = REJECT_TEMPLATES.find((t) => t.id === id);
    if (tpl) setConclusion(tpl.text);
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
        risk_level: riskLevel,
        admin_conclusion: conclusion.trim(),
        suggested_action: action.trim() || null,
      };
      if (decision === "verify") {
        payload.usage_state = usageState;
        if (promotionLevel) payload.promotion_level = promotionLevel;
        else payload.promotion_level = "normal";
      } else {
        payload.usage_state = "banned";
      }

      const response = await fetch(`/api/violations/${caseId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiErrorMessage(result, "审核失败"));

      feedbackToast.success(decision === "verify" ? "已采纳并落库" : "已驳回");
      router.refresh();
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "审核失败");
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = initialStatus === "archived";

  return (
    <section className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D97757] bg-white p-5 sm:p-6">
      <header className="flex items-center gap-2">
        <h2 className="text-[16px] font-semibold tracking-tight text-zinc-800">审核决策</h2>
        <span className="text-[11px] text-zinc-500">
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
            <p className="text-[12px] font-semibold text-zinc-600">使用状态</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {USAGE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = usageState === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUsageState(option.value)}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? option.tone
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />
                    <div className="leading-tight">
                      <p className="text-[13px] font-semibold">{option.label}</p>
                      <p className="text-[11px] text-zinc-500">{option.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-zinc-600">风险等级</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RISK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRiskLevel(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    riskLevel === option.value
                      ? option.tone
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {isOwner && usageState === "available" ? (
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-[13px] text-zinc-700">
              <input
                type="checkbox"
                checked={promote}
                onChange={(event) => setPromote(event.target.checked)}
                className="size-4 rounded border-zinc-300 accent-[#6FAA7D]"
              />
              <Sparkles className="size-4 stroke-[1.5] text-[#6FAA7D]" />
              <span className="font-medium">同时置顶推荐</span>
              <span className="text-[11px] text-zinc-500">仅 Owner 可推广，会出现在员工推荐 banner</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {decision === "reject" ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-zinc-600">驳回原因模板</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REJECT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-zinc-600">风险等级</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RISK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRiskLevel(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    riskLevel === option.value
                      ? option.tone
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {decision ? (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[12px] font-semibold text-zinc-600">
              {decision === "verify" ? "管理员结论" : "驳回原因"}
              <span className="ml-1 text-[#C9604D]">*</span>
            </span>
            <Textarea
              value={conclusion}
              onChange={(event) => setConclusion(event.target.value)}
              placeholder={
                decision === "verify"
                  ? "例如：经实测在多个账号有效，纳入团队可用话术"
                  : "例如：截图 × 清晰，请补充原始素材"
              }
              className="mt-1.5 min-h-[80px] rounded-2xl bg-zinc-50/60"
            />
          </label>

          {decision === "verify" ? (
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-600">建议动作（选填）</span>
              <Textarea
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="例如：发布前提醒队员把敏感词替换为评论区引导"
                className="mt-1.5 min-h-[60px] rounded-2xl bg-zinc-50/60"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {decision ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400">
            {decision === "verify"
              ? "保存后员工立刻能在话术库看到"
              : "保存后此提交从员工列表移除，员工可重新提交"}
          </p>
          <Button
            type="button"
            disabled={submitting || isLocked}
            onClick={submit}
            className="rounded-2xl bg-zinc-900 px-5 text-white hover:bg-zinc-800"
          >
            {submitting ? "保存中..." : decision === "verify" ? "保存并采纳" : "保存并驳回"}
          </Button>
        </div>
      ) : null}

      {isLocked ? (
        <p className="mt-4 inline-flex items-center gap-2 text-[12px] text-zinc-400">
          <AlertTriangle className="size-3.5" />
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
  const accent =
    tone === "positive"
      ? active
        ? "border-[#6FAA7D]/40 bg-[#6FAA7D]/10 text-[#3F6F4F]"
        : "border-zinc-200 bg-white text-zinc-500 hover:border-[#6FAA7D]/30 hover:text-[#3F6F4F]"
      : active
        ? "border-[#C9604D]/40 bg-[#C9604D]/10 text-[#C9604D]"
        : "border-zinc-200 bg-white text-zinc-500 hover:border-[#C9604D]/30 hover:text-[#C9604D]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-2xl border px-4 text-[13px] font-semibold transition-colors",
        accent,
      )}
    >
      <Icon className="size-4 stroke-[1.5]" />
      {label}
    </button>
  );
}
