import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialSubmissionState, REQUIRED_METRIC_KEYS, type EditableMetricKey } from "./提交状态机";
import type { EditableFieldState } from "./填报表单状态";
import { resolveMetricGroupViewModel, type MetricGroupItem } from "./metric-group-state";
import { MetricGroupSection } from "./指标分组区";

const ITEMS: MetricGroupItem[] = [
  { key: "play_count", label: "播放量" },
  { key: "follower_gain", label: "涨粉数" },
  { key: "follower_convert", label: "导粉数", optional: true },
  { key: "avg_play_ratio", label: "平均播放占比", suffix: "%" },
  { key: "likes", label: "点赞数" },
  { key: "comments", label: "评论数" },
  { key: "shares", label: "分享数" },
  { key: "favorites", label: "收藏数" },
  { key: "avg_play_duration", label: "均播时长", suffix: "秒" },
  { key: "bounce_rate_2s", label: "2s跳出率", suffix: "%" },
  { key: "completion_rate_5s", label: "5s完播率", suffix: "%" },
  { key: "completion_rate", label: "整体完播率", suffix: "%" },
];

const ALL_DONE_SLOTS = { screenshot_1: false, screenshot_2: false } as const;
const ALL_OPEN_INPUTS = { screenshot_1: true, screenshot_2: true } as const;

function buildRecognizedFields(
  overrides: Partial<Record<EditableMetricKey, string>> = {},
): Record<string, EditableFieldState> {
  const base = createInitialSubmissionState().fields;
  const fields: Record<string, EditableFieldState> = {};
  for (const item of ITEMS) {
    const isReq = REQUIRED_METRIC_KEYS.includes(item.key);
    const val = overrides[item.key] ?? (isReq ? "1000" : "10");
    fields[item.key] = {
      ...base[item.key],
      value: val,
      ocrValue: isReq ? "1000" : "10",
      source: "ocr",
      confirmed: true,
      confidenceLevel: "high",
    };
  }
  return fields;
}

test("编辑播放量过程中暂不触发跨格超播放量提醒，离开格子后才判定", () => {
  const fields = buildRecognizedFields({
    play_count: "1",
    likes: "50",
    comments: "20",
    shares: "10",
    favorites: "10",
    follower_gain: "30",
  });

  // 刚清掉播放量并敲下第一个数字 "1" 时（聚焦前值为 "1000"），旁边的 5 个格不会闪出提示和边框
  const whileTyping = resolveMetricGroupViewModel({
    items: ITEMS,
    fields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
    frozenFocus: { key: "play_count", value: "1000" },
  });
  for (const key of ["likes", "comments", "shares", "favorites", "follower_gain"] as const) {
    const cell = whileTyping.cells.find((item) => item.item.key === key)!;
    assert.equal(cell.ruleReason, null);
    assert.equal(cell.mode, "settled");
  }

  // 失焦后按当前值 "1" 正式判定，对应格进入提醒
  const afterBlur = resolveMetricGroupViewModel({
    items: ITEMS,
    fields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
    frozenFocus: null,
  });
  const likesAfterBlur = afterBlur.cells.find((item) => item.item.key === "likes")!;
  assert.equal(likesAfterBlur.ruleReason, "高于播放量，请确认");
  assert.equal(likesAfterBlur.mode, "doubt");
});

test("点击「没问题」后记住这组数字已看过，不再重复标红；改数字后重新恢复提醒", () => {
  const fields = buildRecognizedFields({
    play_count: "100",
    follower_gain: "150",
    likes: "10",
    comments: "5",
    shares: "5",
    favorites: "5",
  });

  const initial = resolveMetricGroupViewModel({
    items: ITEMS,
    fields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
  });
  const gainCell = initial.cells.find((item) => item.item.key === "follower_gain")!;
  assert.equal(gainCell.mode, "doubt");
  assert.equal(gainCell.ruleReason, "高于播放量，请确认");
  assert.ok(gainCell.ruleSignature);

  // 点击「没问题」记下该组合签名后：状态恢复 settled、提示清掉、标记为已核对
  const acknowledged = resolveMetricGroupViewModel({
    items: ITEMS,
    fields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
    acknowledgedRuleSignatures: { follower_gain: gainCell.ruleSignature! },
  });
  const acknowledgedCell = acknowledged.cells.find((item) => item.item.key === "follower_gain")!;
  assert.equal(acknowledgedCell.mode, "settled");
  assert.equal(acknowledgedCell.ruleReason, null);
  assert.equal(acknowledgedCell.ruleAcknowledged, true);

  // 之后如果把涨粉改成新数字 "200"，签名变化，提醒重新出现
  const editedFields = buildRecognizedFields({
    play_count: "100",
    follower_gain: "200",
    likes: "10",
    comments: "5",
    shares: "5",
    favorites: "5",
  });
  const rewarned = resolveMetricGroupViewModel({
    items: ITEMS,
    fields: editedFields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
    acknowledgedRuleSignatures: { follower_gain: gainCell.ruleSignature! },
  });
  assert.equal(rewarned.cells.find((item) => item.item.key === "follower_gain")!.mode, "doubt");
});

test("汇总行将识别不准与数值异常提醒分开表述，不把规则提醒算成识别请核对", () => {
  const fields = buildRecognizedFields({
    play_count: "100",
    follower_gain: "150",
    likes: "10",
    comments: "5",
    shares: "5",
    favorites: "5",
  });

  const html = renderToStaticMarkup(
    <MetricGroupSection
      fields={fields}
      slotProcessing={ALL_DONE_SLOTS}
      inputsOpen={ALL_OPEN_INPUTS}
      onFieldChange={() => undefined}
    />,
  );

  assert.match(html, /12 项认出 12 项 · 1 项数值提醒请确认/);
  assert.doesNotMatch(html, /12 项认出 12 项，1 项请核对/);
  assert.match(html, /高于播放量，请确认/);
});

test("手填或未识别出的必填空格显示「待填」，不混入「请核对」", () => {
  const base = createInitialSubmissionState().fields;
  const manualHtml = renderToStaticMarkup(
    <MetricGroupSection
      fields={base}
      slotProcessing={ALL_DONE_SLOTS}
      inputsOpen={ALL_OPEN_INPUTS}
      onFieldChange={() => undefined}
    />,
  );
  assert.match(manualHtml, new RegExp(`${REQUIRED_METRIC_KEYS.length} 项待填`));
  assert.doesNotMatch(manualHtml, /请核对/);

  // OCR 认出部分项时，拆开表述 待填 / 识别请核对 / 数值提醒
  const mixedFields = buildRecognizedFields({
    play_count: "200",
    follower_gain: "250",
    likes: "50",
    favorites: "50",
    comments: "",
    shares: "",
  });
  mixedFields.comments = { ...base.comments, value: "" };
  mixedFields.shares = { ...base.shares, value: "" };
  mixedFields.favorites = { ...mixedFields.favorites, confidenceLevel: "low" };

  const mixed = resolveMetricGroupViewModel({
    items: ITEMS,
    fields: mixedFields,
    slotProcessing: ALL_DONE_SLOTS,
    inputsOpen: ALL_OPEN_INPUTS,
  });
  assert.equal(mixed.recognizedCount, 10);
  assert.equal(mixed.missingRequiredCount, 2);
  assert.equal(mixed.ocrDoubtCount, 1);
  assert.equal(mixed.ruleWarningCount, 1);
  assert.equal(mixed.summaryText, "12 项认出 10 项，2 项待填，1 项请核对 · 另有 1 项数值提醒请确认");
});
