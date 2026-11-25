import { REQUIRED_METRIC_KEYS, type EditableMetricKey, type SubmissionSlotRole } from "@/components/submission/提交状态机";
import { getSlotRoleForMetric } from "@/lib/video-submit/domain/form-rules";
import { resolveMetricCellMode, type MetricCellMode } from "@/components/submission/指标输入卡";
import {
  getInteractionAnomalyReviewReason,
  getMetricAbovePlayCountReason,
  type ConfidenceLevel,
  type EditableFieldState,
} from "@/components/submission/填报表单状态";
import type { MetricInputType } from "@/lib/dashboard-logic/metric-input-cleaner";

export interface MetricGroupItem {
  key: EditableMetricKey;
  label: string;
  step?: string;
  suffix?: string;
  optional?: boolean;
  metricType?: MetricInputType;
}

export interface FocusedFieldSnapshot {
  key: EditableMetricKey;
  value: string;
}

export interface MetricGroupCellViewModel {
  item: MetricGroupItem;
  field: EditableFieldState;
  baseMode: MetricCellMode;
  mode: MetricCellMode;
  ruleReason: string | null;
  ruleSignature: string | null;
  ruleAcknowledged: boolean;
}

export function buildComparisonFields(
  fields: Record<string, EditableFieldState>,
  frozenFocus: FocusedFieldSnapshot | null,
): Record<string, EditableFieldState> {
  if (!frozenFocus) return fields;
  const current = fields[frozenFocus.key];
  if (!current || current.value === frozenFocus.value) return fields;
  return {
    ...fields,
    [frozenFocus.key]: {
      ...current,
      value: frozenFocus.value,
    },
  };
}

function getPlayCountRuleSignature(fields: Record<string, EditableFieldState>): string {
  return [
    fields.play_count?.value?.trim() ?? "",
    fields.likes?.value?.trim() ?? "",
    fields.comments?.value?.trim() ?? "",
    fields.shares?.value?.trim() ?? "",
    fields.favorites?.value?.trim() ?? "",
  ].join(":");
}

function getAbovePlayCountRuleSignature(
  key: EditableMetricKey,
  fields: Record<string, EditableFieldState>,
): string {
  return `${fields.play_count?.value?.trim() ?? ""}:${fields[key]?.value?.trim() ?? ""}`;
}

export function resolveMetricGroupViewModel(args: {
  items: MetricGroupItem[];
  fields: Record<string, EditableFieldState>;
  confidenceLevels?: Partial<Record<EditableMetricKey, ConfidenceLevel>>;
  slotProcessing: Record<SubmissionSlotRole, boolean>;
  inputsOpen: Record<SubmissionSlotRole, boolean>;
  editing?: boolean;
  frozenFocus?: FocusedFieldSnapshot | null;
  acknowledgedRuleSignatures?: Partial<Record<EditableMetricKey, string>>;
}) {
  const {
    items,
    fields,
    confidenceLevels,
    slotProcessing,
    inputsOpen,
    editing = false,
    frozenFocus = null,
    acknowledgedRuleSignatures = {},
  } = args;

  const comparisonFields = buildComparisonFields(fields, frozenFocus);
  const interactionReviewReason = getInteractionAnomalyReviewReason({
    play_count: comparisonFields.play_count?.value ?? null,
    likes: comparisonFields.likes?.value ?? null,
    comments: comparisonFields.comments?.value ?? null,
    shares: comparisonFields.shares?.value ?? null,
    favorites: comparisonFields.favorites?.value ?? null,
  });
  const playRuleSignature = interactionReviewReason ? getPlayCountRuleSignature(comparisonFields) : null;

  const cells: MetricGroupCellViewModel[] = items.map((item) => {
    const field = fields[item.key];
    const confidenceLevel = field?.confidenceLevel ?? confidenceLevels?.[item.key] ?? null;
    const role = getSlotRoleForMetric(item.key);
    const optional = !REQUIRED_METRIC_KEYS.includes(item.key);
    const baseMode = resolveMetricCellMode({
      field,
      confidenceLevel,
      optional,
      slotProcessing: slotProcessing[role],
      inputsOpen: editing || inputsOpen[role],
      forceReview: false,
    });

    const isPlayAnomaly = item.key === "play_count" && interactionReviewReason !== null;
    const abovePlayReason = isPlayAnomaly ? null : getMetricAbovePlayCountReason(item.key, comparisonFields);
    const rawRuleReason = isPlayAnomaly ? interactionReviewReason : abovePlayReason;
    const ruleSignature = isPlayAnomaly
      ? playRuleSignature
      : abovePlayReason
        ? getAbovePlayCountRuleSignature(item.key, comparisonFields)
        : null;
    const ruleAcknowledged = Boolean(
      ruleSignature && acknowledgedRuleSignatures[item.key] === ruleSignature,
    );
    const ruleActive = Boolean(rawRuleReason && !ruleAcknowledged);
    const mode = ruleActive
      ? resolveMetricCellMode({
          field,
          confidenceLevel,
          optional,
          slotProcessing: slotProcessing[role],
          inputsOpen: editing || inputsOpen[role],
          forceReview: true,
        })
      : baseMode;

    return {
      item,
      field,
      baseMode,
      mode,
      ruleReason: ruleActive ? rawRuleReason : null,
      ruleSignature,
      ruleAcknowledged,
    };
  });

  const recognizedCount = cells.filter(({ field }) => Boolean(field?.ocrValue)).length;
  const pendingCount = cells.filter(({ mode }) => mode === "pending").length;
  const missingRequiredCount = cells.filter(({ item, field, baseMode }) => {
    if (baseMode === "missing") return true;
    return baseMode === "blank" && REQUIRED_METRIC_KEYS.includes(item.key) && !item.optional && !(field?.value ?? "").trim();
  }).length;
  const ocrDoubtCount = cells.filter(({ baseMode }) => baseMode === "doubt").length;
  const ruleWarningCount = cells.filter(({ item, field, baseMode, ruleReason }) => {
    if (!ruleReason) return false;
    const alreadyInMissingOrDoubt =
      baseMode === "doubt" ||
      baseMode === "missing" ||
      (baseMode === "blank" && REQUIRED_METRIC_KEYS.includes(item.key) && !item.optional && !(field?.value ?? "").trim());
    return !alreadyInMissingOrDoubt;
  }).length;

  let summaryText = "数字填在下面，点一下就能改";
  if (pendingCount > 0) {
    summaryText = "正在识别截图里的数字…";
  } else if (recognizedCount > 0) {
    const issueParts: string[] = [];
    if (missingRequiredCount > 0) issueParts.push(`${missingRequiredCount} 项待填`);
    if (ocrDoubtCount > 0) issueParts.push(`${ocrDoubtCount} 项请核对`);
    const basePart = issueParts.length > 0
      ? `${items.length} 项认出 ${recognizedCount} 项，${issueParts.join("，")}`
      : `${items.length} 项认出 ${recognizedCount} 项`;
    if (ruleWarningCount > 0) {
      summaryText = issueParts.length > 0
        ? `${basePart} · 另有 ${ruleWarningCount} 项数值提醒请确认`
        : `${basePart} · ${ruleWarningCount} 项数值提醒请确认`;
    } else if (issueParts.length > 0) {
      summaryText = basePart;
    } else {
      summaryText = `${items.length} 项已全部核对`;
    }
  } else {
    const manualParts: string[] = [];
    if (missingRequiredCount > 0) manualParts.push(`${missingRequiredCount} 项待填`);
    if (ocrDoubtCount > 0) manualParts.push(`${ocrDoubtCount} 项请核对`);
    if (manualParts.length > 0 && ruleWarningCount > 0) {
      summaryText = `${manualParts.join(" · ")} · 另有 ${ruleWarningCount} 项数值提醒请确认`;
    } else if (manualParts.length > 0) {
      summaryText = manualParts.join(" · ");
    } else if (ruleWarningCount > 0) {
      summaryText = `${ruleWarningCount} 项数值提醒请确认`;
    }
  }

  return {
    cells,
    recognizedCount,
    missingRequiredCount,
    ocrDoubtCount,
    ruleWarningCount,
    hasSummaryWarning: missingRequiredCount > 0 || ocrDoubtCount > 0 || ruleWarningCount > 0,
    summaryText,
  };
}
