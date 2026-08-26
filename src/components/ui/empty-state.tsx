import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DeskStudyIllustration,
  ZenFinishedIllustration,
  CompassConstellationIllustration,
  DraftRecalibrateIllustration,
  ManuscriptScrollIllustration,
  SearchFilterIllustration,
  TeamCollaborationIllustration,
  RadarCalibrationIllustration,
  CleanFolioArchiveIllustration,
} from "@/components/editorial/editorial-illustrations";

export type EmptyStateVariant =
  | "study"
  | "zen"
  | "compass"
  | "recalibrate"
  | "scroll"
  | "search"
  | "collaboration"
  | "radar"
  | "archive";

interface EmptyStateProps {
  /** @deprecated 已升级为矢量线描体系 */
  icon?: unknown;
  /** 矢量手稿插图变体或自定义插图 */
  variant?: EmptyStateVariant;
  customIllustration?: ReactNode;
  size?: number;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline";
  };
  children?: ReactNode;
  className?: string;
}

const illustrationMap: Record<EmptyStateVariant, (props: { size?: number; className?: string }) => ReactNode> = {
  study: DeskStudyIllustration,
  zen: ZenFinishedIllustration,
  compass: CompassConstellationIllustration,
  recalibrate: DraftRecalibrateIllustration,
  scroll: ManuscriptScrollIllustration,
  search: SearchFilterIllustration,
  collaboration: TeamCollaborationIllustration,
  radar: RadarCalibrationIllustration,
  archive: CleanFolioArchiveIllustration,
};

/**
 * 出版物级空状态 (Editorial Empty State)
 * - 纯单线蚀刻手稿插图 (Monoline Ink Sketch)
 * - 衬线标题 + 从容发丝副标
 * - 温润微气垫与发丝按钮
 */
export function EmptyState({
  variant = "scroll",
  customIllustration,
  size = 88,
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps) {
  const IllustrationComponent = illustrationMap[variant] || ManuscriptScrollIllustration;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-4 select-none",
        className
      )}
    >
      {/* 纯单线蚀刻手稿插图 */}
      <div className="flex items-center justify-center -mt-2 -mb-1">
        {customIllustration ? (
          customIllustration
        ) : (
          <IllustrationComponent size={size} />
        )}
      </div>

      {/* 文人标题与发丝副标 */}
      <div className="space-y-1.5 mt-2 max-w-sm">
        <h3 className="font-serif text-[15px] font-medium text-[#1C1917] tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-[12.5px] leading-relaxed text-[#78716C]">{description}</p>
        )}
      </div>

      {children}

      {action && (
        <Button
          variant={action.variant || "outline"}
          size="sm"
          className="mt-4 h-8 rounded-lg border-[#E5E0D6] bg-white text-[12.5px] font-medium text-[#292524] hover:bg-[#F5F3EE] active:scale-[0.985]"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

