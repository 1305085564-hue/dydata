import type { EvaluationStandards } from "@/lib/evaluation-standards";

export interface AuthorWorksDrawerProps {
  author: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
  evaluationStandards?: EvaluationStandards;
  canManageVideos?: boolean;
  canReviewContent?: boolean;
  canViewCollaboration?: boolean;
  onWorksChanged?: () => void;
  onViewInMainList?: (authorId: string) => void;
}

export interface AuthorWorksViewProps {
  author: { id: string; name: string };
  onClose: () => void;
  onViewInMainList?: (authorId: string) => void;
  evaluationStandards?: EvaluationStandards;
  canManageVideos?: boolean;
  canReviewContent?: boolean;
  canViewCollaboration?: boolean;
  onWorksChanged?: () => void;
  selectedVideoId?: string | null;
  onSelectVideoId?: (videoId: string | null) => void;
}

export function formatCompactNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  if (val >= 100000000) return `${(val / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (val >= 10000) return `${(val / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return String(Math.round(val));
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

