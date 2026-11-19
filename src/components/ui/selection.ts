/**
 * 行的选中三档（《美学宝典》§3.9）：悬停 < 选中 < 控件激活（控件另算）。
 * 行选中统一用 Row Selected `#E4E4E1`，悬停时不变，不得用浅砂 `#F1F1F0` 或悬停色冒充。
 */
export const ROW_HOVER = "hover:bg-[#F7F7F6]";
export const ROW_SELECTED = "bg-[#E4E4E1] hover:bg-[#E4E4E1]";

export function rowSelectionClass(selected: boolean) {
  return selected ? ROW_SELECTED : ROW_HOVER;
}
