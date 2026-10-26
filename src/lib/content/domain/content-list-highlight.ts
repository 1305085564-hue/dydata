/**
 * 视频复盘列表「数据高亮」真值源（2026-10-14 阿禅批准方案 v3）。
 *
 * 产品逻辑：在筛选栏给 12 个数值字段设区间（不低于 / 低于），命中的单元格
 * 淡琥珀底 + 加粗；可开「只看命中高亮的行」把命中行筛出来（多规则取交集）。
 *
 * 口径约定（与播放档位一致）：
 *  - 区间含下限、不含上限（min ≤ v < max）；
 *  - 空值（null）永不命中——没有数据不等于数据低；
 *  - 比率脏值（isImpossibleRatio，越界 0–100）不命中，避免脏数据被高亮误导；
 *  - URL 非法条目静默跳过，与 parseContentListFilters 的回落风格一致；
 *  - 同字段只保留一条规则，重复添加即覆盖。
 */
import { isImpossibleRatio } from "@/lib/metric-bounds";

export type HighlightFieldKey =
  | "playCount"
  | "followerGain"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "interactionRate"
  | "coreMetricRate"
  | "bounceRate2s"
  | "completionRate5s"
  | "avgPlayDuration"
  | "completionRate";

export interface HighlightFieldMeta {
  key: HighlightFieldKey;
  /** 下拉与规则芯片显示的短标签 */
  label: string;
  /** 输入框提示单位 */
  unit: "次" | "%" | "秒";
  isRatio: boolean;
  /** 数字输入步长：计数按 1，比率/秒按 0.1 */
  step: number;
}

/** 顺序与表格列顺序对齐：核心指标 → 互动率 → 计数列 → 完播组 */
export const HIGHLIGHT_FIELDS: readonly HighlightFieldMeta[] = [
  { key: "coreMetricRate", label: "核心指标", unit: "%", isRatio: true, step: 0.1 },
  { key: "interactionRate", label: "互动率", unit: "%", isRatio: true, step: 0.1 },
  { key: "playCount", label: "播放", unit: "次", isRatio: false, step: 1 },
  { key: "followerGain", label: "涨粉", unit: "次", isRatio: false, step: 1 },
  { key: "likes", label: "点赞", unit: "次", isRatio: false, step: 1 },
  { key: "comments", label: "评论", unit: "次", isRatio: false, step: 1 },
  { key: "shares", label: "分享", unit: "次", isRatio: false, step: 1 },
  { key: "favorites", label: "收藏", unit: "次", isRatio: false, step: 1 },
  { key: "bounceRate2s", label: "2s跳出", unit: "%", isRatio: true, step: 0.1 },
  { key: "completionRate5s", label: "5s完播", unit: "%", isRatio: true, step: 0.1 },
  { key: "avgPlayDuration", label: "均播", unit: "秒", isRatio: false, step: 0.1 },
  { key: "completionRate", label: "完播", unit: "%", isRatio: true, step: 0.1 },
] as const;

const FIELD_BY_KEY = new Map(HIGHLIGHT_FIELDS.map((f) => [f.key, f])); // gate:transient-map 模块级常量索引，无 TTL/容量

export function getHighlightFieldMeta(key: HighlightFieldKey): HighlightFieldMeta {
  const meta = FIELD_BY_KEY.get(key);
  if (!meta) throw new Error(`未知高亮字段：${key}`);
  return meta;
}

export interface HighlightRule {
  /** 含下限；null = 不设下界 */
  min: number | null;
  /** 不含上限；null = 不设上界 */
  max: number | null;
}

/** 字段 → 规则；缺键 = 该字段不高亮 */
export type HighlightRuleMap = Partial<Record<HighlightFieldKey, HighlightRule>>;

/** 高亮行需要的最小数值形状；ProcessedContentRow 天然满足 */
export type HighlightValueRow = Record<HighlightFieldKey, number | null>;

/** 命中单元格样式：淡琥珀底 + 同色加粗（设计封闭律：状态色只上淡底与文字，不上实底） */
export const HIGHLIGHT_CELL_CLASS = "rounded px-1 bg-status-warning/[0.12] text-status-warning ";

export function isHighlightRuleMapEmpty(rules: HighlightRuleMap): boolean {
  return Object.values(rules).every((rule) => rule === undefined);
}

/** 单条规则是否命中一个值 */
export function matchesHighlightRule(value: number | null, rule: HighlightRule, isRatio: boolean): boolean {
  if (rule.min === null && rule.max === null) return false;
  if (value == null || !Number.isFinite(value)) return false;
  if (isRatio && isImpossibleRatio(value)) return false;
  if (rule.min !== null && value < rule.min) return false;
  if (rule.max !== null && value >= rule.max) return false;
  return true;
}

/** 单元格高亮判断：该字段有规则且命中才亮 */
export function isCellHighlighted(row: HighlightValueRow, key: HighlightFieldKey, rules: HighlightRuleMap): boolean {
  const rule = rules[key];
  if (!rule) return false;
  return matchesHighlightRule(row[key], rule, getHighlightFieldMeta(key).isRatio);
}

/** 「只看命中」：行必须同时命中全部已设规则（交集） */
export function rowMatchesAllHighlightRules(row: HighlightValueRow, rules: HighlightRuleMap): boolean {
  const entries = Object.entries(rules) as Array<[HighlightFieldKey, HighlightRule | undefined]>;
  const active = entries.filter(([, rule]) => rule !== undefined);
  if (active.length === 0) return true;
  return active.every(([key, rule]) => matchesHighlightRule(row[key], rule!, getHighlightFieldMeta(key).isRatio));
}

/** 规则芯片文案：「播放 ≥10000」「互动率 3.5~6」「完播 <80」 */
export function formatHighlightRuleLabel(key: HighlightFieldKey, rule: HighlightRule): string {
  const { label } = getHighlightFieldMeta(key);
  if (rule.min !== null && rule.max !== null) return `${label} ${rule.min}~${rule.max}`;
  if (rule.min !== null) return `${label} ≥${rule.min}`;
  if (rule.max !== null) return `${label} <${rule.max}`;
  return label;
}

/** URL 紧凑编码：hl=key:min:max;...（空段=null），无规则返回 "" */
export function serializeHighlightRules(rules: HighlightRuleMap): string {
  const segments: string[] = [];
  for (const field of HIGHLIGHT_FIELDS) {
    const rule = rules[field.key];
    if (!rule || (rule.min === null && rule.max === null)) continue;
    segments.push(`${field.key}:${rule.min ?? ""}:${rule.max ?? ""}`);
  }
  return segments.join(";");
}

function parseBound(raw: string): number | null | "invalid" {
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return "invalid";
  return num;
}

/** 解析 URL 的 hl 参数；非法条目（未知字段/非数字/负数/min≥max）静默跳过 */
export function parseHighlightRules(raw: string | null): HighlightRuleMap {
  if (!raw) return {};
  const rules: HighlightRuleMap = {};
  for (const segment of raw.split(";")) {
    if (!segment) continue;
    const parts = segment.split(":");
    if (parts.length !== 3) continue;
    const [key, minRaw, maxRaw] = parts;
    if (!FIELD_BY_KEY.has(key as HighlightFieldKey)) continue;
    const min = parseBound(minRaw ?? "");
    const max = parseBound(maxRaw ?? "");
    if (min === "invalid" || max === "invalid") continue;
    if (min !== null && max !== null && min >= max) continue;
    if (min === null && max === null) continue;
    rules[key as HighlightFieldKey] = { min, max };
  }
  return rules;
}
