import type { EditableMetricKey } from "@/components/submission/提交状态机";

export const METRIC_TAB_ORDER: readonly EditableMetricKey[] = [
  "play_count",
  "follower_gain",
  "follower_convert",
  "likes",
  "comments",
  "shares",
  "favorites",
  "avg_play_duration",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
] as const;

export type MetricFocusTarget = EditableMetricKey | "content";

/**
 * 计算当在指定指标输入框按下回车时的下一个焦点目标。
 * 顺序从 play_count 依次遍历到 completion_rate；
 * 当在最后一项（completion_rate）按下回车时，返回 "content"，指示聚焦到文案输入区。
 */
export function getNextMetricFocusTarget(
  currentKey: EditableMetricKey,
  tabOrder: readonly EditableMetricKey[] = METRIC_TAB_ORDER,
): MetricFocusTarget | null {
  const idx = tabOrder.indexOf(currentKey);
  if (idx < 0) return null;
  if (idx === tabOrder.length - 1) {
    return "content";
  }
  return tabOrder[idx + 1];
}

/**
 * 计算当在指定指标输入框按下 Shift+Enter 时的上一个焦点目标。
 * 若为第一项（play_count），返回 null。
 */
export function getPrevMetricFocusTarget(
  currentKey: EditableMetricKey,
  tabOrder: readonly EditableMetricKey[] = METRIC_TAB_ORDER,
): EditableMetricKey | null {
  const idx = tabOrder.indexOf(currentKey);
  if (idx <= 0) return null;
  return tabOrder[idx - 1];
}
