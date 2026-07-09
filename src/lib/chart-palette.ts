/**
 * 阿禅美学法典 V1 · 图表统一色板
 * 所有 recharts / chart 组件必须引用本常量，禁止硬编码颜色
 */
export const CHART_COLORS = {
  primary: "#D97757",    // Claude 暖橙（主线）
  secondary: "#8AA8C7",  // 石青（辅线）
  success: "#6FAA7D",    // 森林绿
  warning: "#D99E55",    // 晚霞琥珀
  danger: "#C9604D",     // 晚霞红
  muted: "#A1A1AA",      // stone-400（次线 / 基准线）
  grid: "#E4E4E7",       // stone-200（网格虚线）
  axis: "#A1A1AA",       // stone-400（坐标轴文字）
} as const;

/**
 * 多条线按顺序取色，超过 5 条循环使用
 */
export const CHART_SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
] as const;

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
  fontFamily: "var(--font-mono, ui-monospace), tabular-nums",
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
