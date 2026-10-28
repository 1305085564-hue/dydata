"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_EVALUATION_STANDARDS,
  EVALUATION_METRICS,
  parseEvaluationStandards,
  type EvaluationMetric,
  type EvaluationStandards,
} from "@/lib/evaluation-standards";

type TargetKey = keyof EvaluationStandards["targets"];
type EvaluationStandardsDraft = {
  [Metric in EvaluationMetric]: { good: string; poor: string };
} & {
  minPlayCount: string;
  targets: Record<TargetKey, string>;
};

export type EvaluationSettingsView = {
  standards: EvaluationStandards;
  updatedAt: string | null;
};

const targetFields: ReadonlyArray<{ key: TargetKey; label: string }> = [
  { key: "reviewLikeRate", label: "复盘点赞率" },
  { key: "dryFavoriteRate", label: "干货收藏率" },
  { key: "interactionRate", label: "互动率" },
  { key: "followerRate", label: "转粉率" },
];

export function createEvaluationStandardsDraft(standards: EvaluationStandards): EvaluationStandardsDraft {
  return {
    minPlayCount: String(standards.minPlayCount),
    bounceRate2s: { good: String(standards.bounceRate2s.good), poor: String(standards.bounceRate2s.poor) },
    completionRate5s: { good: String(standards.completionRate5s.good), poor: String(standards.completionRate5s.poor) },
    avgPlayDuration: { good: String(standards.avgPlayDuration.good), poor: String(standards.avgPlayDuration.poor) },
    completionRate: { good: String(standards.completionRate.good), poor: String(standards.completionRate.poor) },
    coreAchievement: { good: String(standards.coreAchievement.good), poor: String(standards.coreAchievement.poor) },
    interactionAchievement: { good: String(standards.interactionAchievement.good), poor: String(standards.interactionAchievement.poor) },
    targets: {
      reviewLikeRate: String(standards.targets.reviewLikeRate),
      dryFavoriteRate: String(standards.targets.dryFavoriteRate),
      interactionRate: String(standards.targets.interactionRate),
      followerRate: String(standards.targets.followerRate),
    },
  };
}

function draftNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

export function parseEvaluationStandardsDraft(draft: EvaluationStandardsDraft) {
  return parseEvaluationStandards({
    minPlayCount: draftNumber(draft.minPlayCount),
    bounceRate2s: { good: draftNumber(draft.bounceRate2s.good), poor: draftNumber(draft.bounceRate2s.poor) },
    completionRate5s: { good: draftNumber(draft.completionRate5s.good), poor: draftNumber(draft.completionRate5s.poor) },
    avgPlayDuration: { good: draftNumber(draft.avgPlayDuration.good), poor: draftNumber(draft.avgPlayDuration.poor) },
    completionRate: { good: draftNumber(draft.completionRate.good), poor: draftNumber(draft.completionRate.poor) },
    coreAchievement: { good: draftNumber(draft.coreAchievement.good), poor: draftNumber(draft.coreAchievement.poor) },
    interactionAchievement: { good: draftNumber(draft.interactionAchievement.good), poor: draftNumber(draft.interactionAchievement.poor) },
    targets: {
      reviewLikeRate: draftNumber(draft.targets.reviewLikeRate),
      dryFavoriteRate: draftNumber(draft.targets.dryFavoriteRate),
      interactionRate: draftNumber(draft.targets.interactionRate),
      followerRate: draftNumber(draft.targets.followerRate),
    },
  });
}

function formatStandard(value: number, unit: string) {
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "目前使用默认标准";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已载入当前标准";
  return `最近保存于 ${date.toLocaleString("zh-CN", { hour12: false })}`;
}

function errorMessage(value: unknown) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return "保存没有完成，已填写内容还在，可以再试一次";
}

interface EvaluationStandardsTabsProps {
  calculationContent: ReactNode;
  initialSettings: EvaluationSettingsView | null;
  canEdit: boolean;
  loadError?: string | null;
}

export function EvaluationStandardsTabs({
  calculationContent,
  initialSettings,
  canEdit,
  loadError = null,
}: EvaluationStandardsTabsProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(() =>
    createEvaluationStandardsDraft(initialSettings?.standards ?? DEFAULT_EVALUATION_STANDARDS),
  );
  const [savedDraft, setSavedDraft] = useState(() =>
    createEvaluationStandardsDraft(initialSettings?.standards ?? DEFAULT_EVALUATION_STANDARDS),
  );
  const [updatedAt, setUpdatedAt] = useState(initialSettings?.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  useEffect(() => {
    if (!canEdit || !isDirty) return;

    const handlePageExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "评价标准尚未保存";
    };
    const handleInternalNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link || link.getAttribute("target") === "_blank" || link.hasAttribute("download")) return;
      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (!window.confirm("评价标准尚未保存，离开后填写内容会丢失。确定离开吗？")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", handlePageExit);
    document.addEventListener("click", handleInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      document.removeEventListener("click", handleInternalNavigation, true);
    };
  }, [canEdit, isDirty]);

  const updateMetric = (metric: EvaluationMetric, band: "good" | "poor", value: string) => {
    setDraft((current) => ({
      ...current,
      [metric]: { ...current[metric], [band]: value },
    }));
    setValidationError(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const updateTarget = (target: TargetKey, value: string) => {
    setDraft((current) => ({ ...current, targets: { ...current.targets, [target]: value } }));
    setValidationError(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const updateMinPlayCount = (value: string) => {
    setDraft((current) => ({ ...current, minPlayCount: value }));
    setValidationError(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const restoreDefaults = () => {
    setDraft(createEvaluationStandardsDraft(DEFAULT_EVALUATION_STANDARDS));
    setValidationError(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    const parsed = parseEvaluationStandardsDraft(draft);
    if (!parsed.success) {
      setValidationError(parsed.error);
      setSaveMessage(null);
      setSaveError(null);
      return;
    }

    setSaving(true);
    setValidationError(null);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin/evaluation-standards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ standards: parsed.data, expectedUpdatedAt: updatedAt }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(result));

      const saved = parseEvaluationStandards(result?.standards);
      if (!saved.success || typeof result?.updatedAt !== "string" || result.canEdit !== true) {
        throw new Error("保存结果无法确认，已填写内容还在，请重新载入页面核对");
      }

      const nextDraft = createEvaluationStandardsDraft(saved.data);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setUpdatedAt(result.updatedAt);
      setSaveMessage("已保存。当前标准已用于重新判断历史作品，原始数据没有变化。");
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存没有完成，已填写内容还在，可以再试一次");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tabs defaultValue="calculation" className="gap-5">
      <TabsList aria-label="数据口径页签" variant="line">
        <TabsTrigger value="calculation">计算口径</TabsTrigger>
        <TabsTrigger value="evaluation">评价标准</TabsTrigger>
      </TabsList>

      <TabsContent value="calculation" keepMounted>
        {calculationContent}
      </TabsContent>

      <TabsContent value="evaluation" keepMounted>
        {loadError ? (
          <p role="alert" className="text-[14px] text-[#1F1E1D]">{loadError}</p>
        ) : !initialSettings ? (
          <p role="alert" className="text-[14px] text-[#1F1E1D]">评价标准暂时无法读取，请稍后重试。</p>
        ) : (
          <section className="max-w-4xl space-y-5">
            <div className="space-y-3">
              <p className="text-[14px] leading-6 text-[#1F1E1D]">
                本标准适用于本公司所有账号。保存后将按当前标准重新判断历史作品，原始数据不会改变。
              </p>
              <p className="text-[12px] text-[#78716C]">
                好标准显示为红色，差标准显示为绿色，中间为普通；达到播放量门槛前不判断好坏。{formatUpdatedAt(updatedAt)}。
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-[14px] text-[#141413]">作品表现好坏标准</h2>
                <p className="mt-1 text-[12px] text-[#78716C]">百分比按数值填写，例如 2 表示 2%；时长单位为秒。</p>
              </div>
              <Table className="min-w-[330px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>指标</TableHead>
                      <TableHead className="text-right">好标准（红）</TableHead>
                      <TableHead className="text-right">差标准（绿）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EVALUATION_METRICS.map((metric) => (
                      <TableRow key={metric.key}>
                        <TableHead scope="row" className="text-[14px] text-[#1F1E1D]">
                          {metric.label}
                        </TableHead>
                        {(["good", "poor"] as const).map((band) => {
                          const value = draft[metric.key][band];
                          return (
                            <TableCell key={band} className="text-right">
                              {canEdit ? (
                                <div className="ml-auto flex w-20 items-center sm:w-32 gap-1">
                                  <span className="text-[12px] text-[#78716C]">{metric.lowerIsBetter ? (band === "good" ? "≤" : ">") : (band === "good" ? "≥" : "≤")}</span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    maxLength={12}
                                    aria-label={`${metric.label}${band === "good" ? "好标准" : "差标准"}`}
                                    className="text-right tabular-nums"
                                    value={value}
                                    disabled={saving}
                                    onChange={(event) => updateMetric(metric.key, band, event.target.value)}
                                  />
                                  <span className="shrink-0 text-[12px] text-[#78716C]">{metric.unit}</span>
                                </div>
                              ) : (
                                <span>{metric.lowerIsBetter ? (band === "good" ? "≤ " : "> ") : (band === "good" ? "≥ " : "≤ ")}{formatStandard(Number(value), metric.unit)}</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-[14px] text-[#141413]">达标基准与判断门槛</h2>
                <p className="mt-1 text-[12px] text-[#78716C]">基准代表达成 100%；复盘看点赞率，干货看收藏率。基准须大于 0 且不超过 100%。</p>
              </div>
              <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {targetFields.map(({ key, label }) => (
                  <label key={key} className="space-y-1">
                    <span className="block text-[12px] text-[#78716C]">{label}达标基准</span>
                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          maxLength={12}
                          aria-label={`${label}达标基准`}
                          value={draft.targets[key]}
                          disabled={saving}
                          onChange={(event) => updateTarget(key, event.target.value)}
                        />
                        <span className="text-[12px] text-[#78716C]">%</span>
                      </div>
                    ) : (
                      <span className="block min-h-8 py-1 text-[14px] tabular-nums text-[#1F1E1D]">
                        {formatStandard(draftNumber(draft.targets[key]), "%")}
                      </span>
                    )}
                  </label>
                ))}
                <label className="space-y-1">
                  <span className="block text-[12px] text-[#78716C]">最低播放量</span>
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={12}
                        aria-label="最低播放量"
                        value={draft.minPlayCount}
                        disabled={saving}
                        onChange={(event) => updateMinPlayCount(event.target.value)}
                      />
                      <span className="shrink-0 text-[12px] text-[#78716C]">播放</span>
                    </div>
                  ) : (
                    <span className="block min-h-8 py-1 text-[14px] tabular-nums text-[#1F1E1D]">
                      {new Intl.NumberFormat("zh-CN").format(draftNumber(draft.minPlayCount))} 播放
                    </span>
                  )}
                </label>
              </div>
            </div>

            {canEdit ? (
              <div className="space-y-3 border-t border-[#E2E2DF]/60 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={handleSave} loading={saving} disabled={!isDirty}>
                    保存标准
                  </Button>
                  <Button type="button" variant="outline" onClick={restoreDefaults} disabled={saving}>
                    恢复默认
                  </Button>
                  {isDirty ? <span className="text-[12px] text-[#78716C]">有未保存的修改</span> : null}
                </div>
                {validationError ? <p role="alert" className="text-[14px] text-[#1F1E1D]">{validationError}</p> : null}
                {saveError ? <p role="alert" className="text-[14px] text-[#1F1E1D]">{saveError}</p> : null}
                {saveMessage ? <p role="status" className="text-[14px] text-[#1F1E1D]">{saveMessage}</p> : null}
              </div>
            ) : null}
          </section>
        )}
      </TabsContent>
    </Tabs>
  );
}
