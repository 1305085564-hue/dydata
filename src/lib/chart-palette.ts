/**
 * 阿禅美学法典 V1 · 图表统一色板
 * 所有 recharts / chart 组件必须引用本常量，禁止硬编码颜色
 */
export const CATEGORICAL_COLORS = [
  "#4F5E96", // 靛青
  "#7E5C99", // 藕紫
  "#A85A6B", // 陈玫
  "#3E8479", // 青瓷
  "#7A7A3E", // 苔橄榄
] as const;

export const CATEGORICAL_LABEL_ALPHA = 0.12;
export const CATEGORICAL_AMBIENT_ALPHA = 0.08;

export const CHART_COLORS = {
  primary: "#D97757",    // Claude 暖橙（主线）
  secondary: CATEGORICAL_COLORS[0], // 表达色靛青（无语义辅线）
  success: "#6FAA7D",    // 森林绿
  warning: "#D99E55",    // 晚霞琥珀
  danger: "#C9604D",     // 晚霞红
  muted: "#78716C",      // stone-500（次线 / 基准线）
  grid: "#E7E5E4",       // stone-200（网格虚线）
  axis: "#78716C",       // stone-500（坐标轴文字）
} as const;

/**
 * 暖橙渐变（面积图/渐变填充用）
 */
export const CHART_GRADIENT_PRIMARY = {
  from: "#D97757",
  to: "rgba(217,119,87,0.12)",
} as const;

/**
 * 坐标轴统一样式（XAxis/YAxis 的 tick prop）
 */
export const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: CHART_COLORS.axis,
  fontFamily: "var(--font-inter), Inter, -apple-system, PingFang SC, system-ui, sans-serif",
} as const;

/**
 * 网格统一样式（CartesianGrid 的 prop）
 * 规范：0.5px stone-200 虚线 50% 透明
 */
export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: CHART_COLORS.grid,
  strokeOpacity: 0.5,
  strokeWidth: 0.5,
  vertical: false,
} as const;

/**
 * 表达色池用法：
 * - 分类标签：同色实字 + 同色淡底（alpha = 0.12）
 * - 氛围底色：实色降到 alpha = 0.08
 */
