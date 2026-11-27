import type { RefObject } from "react";
import type { MetricGroupHandle } from "@/components/submission/指标分组区";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";

export type IssueAnchor = "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null;

/** 通过稳定 DOM 锚点滚动到问题区块，避免事件回调在渲染期捕获 React ref。 */
export function scrollToSubmitIssueAnchor(
  anchor: IssueAnchor,
  options?: { onOpenMoreSection?: () => void },
) {
  if (!anchor) return;
  if (anchor === "topicTag") {
    options?.onOpenMoreSection?.();
  }
  if (typeof document === "undefined") return;
  const target = document.querySelector<HTMLElement>(`[data-submit-anchor="${anchor}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function focusSubmissionIssueTarget(args: {
  anchor: IssueAnchor;
  invalidKey: ExtendedSubmissionIssueSummary["firstInvalidFieldKey"];
  missingRequiredSlotsCount?: number;
  focusWithHighlight: (el: HTMLElement | null) => void;
  triggerSlotsPulse: () => void;
  metricsGroupRef: RefObject<MetricGroupHandle | null>;
  metaVideoTitleRef: RefObject<HTMLInputElement | null>;
  contentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  topicTagSectionRef: RefObject<HTMLDivElement | null>;
  publishedAtSectionRef: RefObject<HTMLDivElement | null>;
  slotsSectionRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    anchor,
    invalidKey,
    missingRequiredSlotsCount = 0,
    focusWithHighlight,
    triggerSlotsPulse,
    metricsGroupRef,
    metaVideoTitleRef,
    contentTextareaRef,
    topicTagSectionRef,
    publishedAtSectionRef,
    slotsSectionRef,
  } = args;

  const focusTopicChip = () => {
    const topicBtn = topicTagSectionRef.current?.querySelector<HTMLElement>(
      '[data-topic-tag-chip="true"], button, [tabindex="0"]',
    );
    focusWithHighlight(topicBtn ?? null);
  };

  if (invalidKey) {
    if (invalidKey === "videoTitle") {
      focusWithHighlight(metaVideoTitleRef.current);
    } else if (invalidKey === "content") {
      focusWithHighlight(contentTextareaRef.current);
    } else if (invalidKey === "topicTag") {
      if (topicTagSectionRef.current?.querySelector('[data-topic-tag-chip="true"]')) {
        focusTopicChip();
      } else {
        window.requestAnimationFrame(focusTopicChip);
      }
    } else {
      metricsGroupRef.current?.focusMetric(invalidKey);
    }
    return;
  }

  if (anchor === "slots" || missingRequiredSlotsCount > 0) {
    triggerSlotsPulse();
    const slotEl = slotsSectionRef.current?.querySelector<HTMLElement>(
      '[role="button"][tabindex="0"], [tabindex="0"], button',
    ) ?? slotsSectionRef.current;
    focusWithHighlight(slotEl);
  } else if (anchor === "meta") {
    focusWithHighlight(metaVideoTitleRef.current ?? contentTextareaRef.current);
  } else if (anchor === "topicTag") {
    if (topicTagSectionRef.current?.querySelector('[data-topic-tag-chip="true"]')) {
      focusTopicChip();
    } else {
      window.requestAnimationFrame(focusTopicChip);
    }
  } else if (anchor === "publishedAt") {
    const pubInput = publishedAtSectionRef.current?.querySelector<HTMLElement>("input, button, [tabindex='0']");
    focusWithHighlight(pubInput ?? publishedAtSectionRef.current);
  }
}
