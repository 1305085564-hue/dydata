/** 领域颜色预设：token → 各场景实际色值。
 * 卡片整卡用极淡背景(tintBg) + 左缘细色条(rail)；选色器/色点用 solid。
 * 全部低饱和暖色系为主，跟此刻整体气质一致，不刺眼。
 */
export interface AreaColorToken {
  value: string; // 存进数据库的 token
  label: string;
  solid: string; // 色点/选中态实色
  tintBg: string; // 整卡淡色背景
  rail: string; // 左缘色条
}

export const AREA_COLORS: AreaColorToken[] = [
  { value: "orange", label: "暖橙", solid: "#D97757", tintBg: "rgba(217, 119, 87, 0.14)", rail: "rgba(217, 119, 87, 0.55)" },
  { value: "amber", label: "琥珀", solid: "#D9A441", tintBg: "rgba(217, 164, 65, 0.16)", rail: "rgba(217, 164, 65, 0.55)" },
  { value: "green", label: "竹绿", solid: "#5B9A6B", tintBg: "rgba(91, 154, 107, 0.15)", rail: "rgba(91, 154, 107, 0.5)" },
  { value: "teal", label: "青", solid: "#4C9A98", tintBg: "rgba(76, 154, 152, 0.15)", rail: "rgba(76, 154, 152, 0.5)" },
  { value: "blue", label: "靛蓝", solid: "#5878B5", tintBg: "rgba(88, 120, 181, 0.14)", rail: "rgba(88, 120, 181, 0.5)" },
  { value: "violet", label: "紫", solid: "#8A6BB5", tintBg: "rgba(138, 107, 181, 0.14)", rail: "rgba(138, 107, 181, 0.5)" },
  { value: "rose", label: "玫红", solid: "#C2607A", tintBg: "rgba(194, 96, 122, 0.14)", rail: "rgba(194, 96, 122, 0.5)" },
  { value: "slate", label: "石墨", solid: "#71717A", tintBg: "rgba(113, 113, 122, 0.13)", rail: "rgba(113, 113, 122, 0.45)" },
];

const COLOR_MAP = new Map(AREA_COLORS.map((c) => [c.value, c]));

/** 取色：支持预设 token；传 hex 则用其原值兜底（tint 用低透明度叠加）。 */
export function resolveAreaColor(color: string | null | undefined): AreaColorToken | null {
  if (!color) return null;
  const preset = COLOR_MAP.get(color);
  if (preset) return preset;
  // 兜底：自定义 hex
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { value: color, label: "自定义", solid: color, tintBg: hexToRgba(color, 0.06), rail: hexToRgba(color, 0.5) };
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
