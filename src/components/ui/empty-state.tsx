import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** @deprecated Blueprint 空状态不再使用 Lucide 图标 */
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * 规范 5.1 空状态 Blueprint
 * - 底层卡尺：0.5px 虚线圆轨 + 十字辅助线
 * - 核心点：8px 暖橙径向渐变 + 4s Y轴浮动
 * - 文案保留诗意，按规范字号
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0 text-center",
        className
      )}
    >
      {/* Blueprint 图形层：120px 容器 */}
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        {/* 底层卡尺 SVG */}
        <svg className="absolute inset-0" viewBox="0 0 120 120" aria-hidden="true">
          {/* 虚线圆轨：直径48px，r=24 */}
          <circle
            cx="60"
            cy="60"
            r="24"
            fill="none"
            stroke="#D4D4D8"
            strokeWidth="0.5"
            strokeDasharray="3,3"
          />
          {/* 十字辅助线 */}
          <line x1="60" y1="36" x2="60" y2="84" stroke="#E4E4E7" strokeWidth="0.5" />
          <line x1="36" y1="60" x2="84" y2="60" stroke="#E4E4E7" strokeWidth="0.5" />
          {/* 径向渐变定义 */}
          <defs>
            <radialGradient id="empty-state-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E28D71" />
              <stop offset="100%" stopColor="#D97757" />
            </radialGradient>
          </defs>
        </svg>
        {/* 核心点：8px 圆，径向渐变，浮动 */}
        <div
          className="relative h-2 w-2 rounded-full animate-float-y"
          style={{
            background: "radial-gradient(circle, #E28D71 0%, #D97757 100%)",
            boxShadow: "0 2px 6px rgba(217,119,87,0.3)",
          }}
        />
      </div>

      {/* 文案层 */}
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-stone-500 mt-4">{title}</p>
        {description && (
          <p className="max-w-[240px] text-[12px] text-stone-400 mt-1">{description}</p>
        )}
      </div>

      {action && (
        <Button variant="outline" size="sm" className="mt-3" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
