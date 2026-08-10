import type { AttributionFinding } from "@/lib/content-attribution";

type CopyFinding = Pick<AttributionFinding, "metric_label" | "tone" | "value" | "ref_value" | "delta" | "points_to"> & {
  ref_label?: string;
};

export type ContentFeedbackCopyInput = {
  title?: string | null;
  findings: CopyFinding[];
  mainIssue?: string | null;
  suggestion?: string | null;
};

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatMetricValue(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "缺数据";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDelta(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `，偏离 ${sign}${value.toFixed(1)}`;
}

export function buildContentFeedbackCopyText(input: ContentFeedbackCopyInput) {
  const title = cleanText(input.title) || "未命名视频";
  const mainIssue = cleanText(input.mainIssue) || "暂无人工填写的主要问题，请先补充复盘结论。";
  const suggestion = cleanText(input.suggestion) || "暂无人工填写的改进建议，请先补充具体动作。";
  const findings = input.findings
    .filter((finding) => finding.tone === "bad" || finding.tone === "warn")
    .slice(0, 5);

  const findingLines = findings.length > 0
    ? findings.map((finding, index) => {
        const referenceLabel = cleanText(finding.ref_label);
        const reference = finding.ref_value == null
          ? ""
          : `，${referenceLabel ? `${referenceLabel} ` : "参照 "}${formatMetricValue(finding.ref_value)}`;
        return `${index + 1}. ${finding.metric_label}: 当前 ${formatMetricValue(finding.value)}${reference}${formatDelta(finding.delta)}。指向: ${finding.points_to}`;
      })
    : ["1. 暂无明显异常指标，建议保留有效做法，重点检查脚本表达是否可复用。"];

  return [
    `视频复盘建议：${title}`,
    "",
    `主要问题：${mainIssue}`,
    "",
    "归因要点：",
    ...findingLines,
    "",
    "改进建议：",
    suggestion,
  ].join("\n");
}
