import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** @deprecated Blueprint 空状态不再使用 Lucide 图标 */
  icon?: LucideIcon;
  /** 暖墨手稿插图插槽 (如 DeskStudyIllustration / CompassConstellationIllustration / ZenFinishedIllustration) */
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * 规范 5.1/5.8 空状态
 * - 支持已有暖墨手稿插图 (illustration)
 * - 默认 Blueprint 刻度圆轨
 * - 文案保留诗意，按规范字号
 */
export function EmptyState({ title, description, action, illustration, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0 text-center",
        className
      )}
    >
      {/* 图形层：优先使用暖墨手稿插图，未传时使用 Blueprint 容器 */}
      {illustration ? (
        <div className="flex items-center justify-center select-none py-1">
          {illustration}
        </div>
      ) : (
        <div className="relative flex h-[120px] w-[120px] items-center justify-center">
          {/* 底层卡尺 SVG */}
          <svg className="absolute inset-0" viewBox="0 0 120 120" aria-hidden="true">
            {/* 虚线圆轨：直径48px，r=24 */}
            <circle
              cx="60"
              cy="60"
              r="24"
              fill="none"
              stroke="#E2E2DF"
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
            {/* 十字辅助线 */}
            <line x1="60" y1="36" x2="60" y2="84" stroke="#E2E2DF" strokeWidth="0.5" />
            <line x1="36" y1="60" x2="84" y2="60" stroke="#E2E2DF" strokeWidth="0.5" />
          </svg>
          {/* 核心点：8px 优雅克制点，微动效 */}
          <div
            className="relative h-2 w-2 rounded-full bg-[#A8A29E] animate-float-y"
          />
        </div>
      )}

      {/* 文案层 */}
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[#292524] mt-4">{title}</p>
        {description && (
          <p className="max-w-[240px] text-[13px] text-[#78716C] mt-1">{description}</p>
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
