import { cn } from "@/lib/utils";
import type { SopCheckpointStatus } from "@/types";
import { STATUS_THEME } from "./status-theme";

interface StatusBadgeProps {
  status: SopCheckpointStatus;
  minimal?: boolean;
}

/**
 * 法典 V1 · 状态徽章
 * - minimal: 仅显示 6px 状态点
 * - 默认: zinc-50 灰底 + 边框 + 状态点 + 文字色（× 大面积彩底）
 */
export function StatusBadge({ status, minimal = false }: StatusBadgeProps) {
  const theme = STATUS_THEME[status] ?? STATUS_THEME.IDLE;
  if (minimal) {
    return <div className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />;
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1 text-[10px] font-medium tracking-tight",
        theme.color,
      )}
    >
      <div className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
      {theme.label}
    </div>
  );
}
