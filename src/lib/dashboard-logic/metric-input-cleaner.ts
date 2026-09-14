/**
 * 指标输入智能清洗工具
 * 纯显示与纯输入增强，支持一线创作者常见的复制/输入格式：
 * - 1.2w / 1.2万 / 12W -> 12000
 * - 3.5k / 3K / 3千 -> 3500
 * - 12,345 / 1,234,567 -> 12345 / 1234567
 * - 35.5% / 80% -> 35.5 / 80
 * - 45s / 45秒 -> 45
 * - 1:20 (分:秒) -> 80
 * - 全角数字与字母/符号 -> 半角
 */

/** 将全角字符（数字、字母、常用符号）转半角 */
export function normalizeFullWidthNumbers(str: string): string {
  return str
    .replace(/[\uFF01-\uFF5E]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, " ");
}

export type MetricInputType = "count" | "rate" | "duration";

export const METRIC_INPUT_TYPE_BY_FIELD = {
  play_count: "count",
  follower_gain: "count",
  follower_convert: "count",
  likes: "count",
  comments: "count",
  shares: "count",
  favorites: "count",
  avg_play_duration: "duration",
  bounce_rate_2s: "rate",
  completion_rate_5s: "rate",
  completion_rate: "rate",
} as const satisfies Record<string, MetricInputType>;

export type MetricInputField = keyof typeof METRIC_INPUT_TYPE_BY_FIELD;

/** 智能清洗指标输入文本 */
export function cleanMetricInputValue(
  rawInput: string,
  metricType: MetricInputType = "count",
): string {
  if (!rawInput) return "";

  let input = normalizeFullWidthNumbers(rawInput.trim());

  // 1. 拦截负数：业务指标均不允许为负数，检测到负号直接剔除负号
  if (input.startsWith("-") || input.includes("-")) {
    input = input.replace(/-/g, "");
  }

  // 2. 去除千分位逗号（半角与全角逗号均已被标准化为 ,）
  input = input.replace(/,/g, "");

  // 3. 去除百分号
  if (input.endsWith("%")) {
    input = input.slice(0, -1).trim();
  }

  // 4. 处理时间格式 01:25 或 1分20秒 -> 仅限 duration 字段允许转总秒数！
  // 严禁百分比 (rate) 或计数字段 (count) 误把 1:20 误当成 80
  if (metricType === "duration") {
    const timeColonMatch = input.match(/^(\d{1,3}):(\d{1,2})$/);
    if (timeColonMatch) {
      const minutes = Number.parseInt(timeColonMatch[1], 10);
      const seconds = Number.parseInt(timeColonMatch[2], 10);
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        return String(minutes * 60 + seconds);
      }
    }

    const timeCnMatch = input.match(/^(\d{1,3})分(\d{1,2})秒?$/);
    if (timeCnMatch) {
      const minutes = Number.parseInt(timeCnMatch[1], 10);
      const seconds = Number.parseInt(timeCnMatch[2], 10);
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        return String(minutes * 60 + seconds);
      }
    }

    // 去除常见时长/单位后缀 s/S/秒
    input = input.replace(/([0-9.]+)\s*(?:s|S|秒)$/, "$1");
  }

  // 5. 万 / w / W / 千 / k / 亿 倍数转换 -> 仅限 count 计数字段允许！
  // 严禁完播率 (rate) 或时长 (duration) 误把 1.2w 转成 12000
  if (metricType === "count") {
    const wanMatch = input.match(/^([0-9.]+)\s*(?:w|W|万)$/);
    if (wanMatch) {
      const num = Number.parseFloat(wanMatch[1]);
      if (!Number.isNaN(num)) {
        return String(Math.round(num * 10000));
      }
    }

    const kMatch = input.match(/^([0-9.]+)\s*(?:k|K|千)$/);
    if (kMatch) {
      const num = Number.parseFloat(kMatch[1]);
      if (!Number.isNaN(num)) {
        return String(Math.round(num * 1000));
      }
    }

    const yiMatch = input.match(/^([0-9.]+)\s*(?:亿)$/);
    if (yiMatch) {
      const num = Number.parseFloat(yiMatch[1]);
      if (!Number.isNaN(num)) {
        return String(Math.round(num * 100000000));
      }
    }
  }

  return input;
}
