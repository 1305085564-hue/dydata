import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nextSortOrder(rows: Array<{ sort_order: number }>) {
  const max = rows.reduce((current, row) => Math.max(current, row.sort_order), 0);
  return String(max + 10 || 10);
}

export function estimateChars(tokenLimit: number) {
  return Math.max(600, Math.round(tokenLimit / 1.2));
}

export function getStatusBadge(enabled: boolean, isDefault?: boolean) {
  if (!enabled) {
    return <Badge variant="outline">已停用</Badge>;
  }

  if (isDefault) {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">默认启用</Badge>;
  }

  return <Badge variant="secondary">已启用</Badge>;
}

export function EmptyBlock({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-white/70 px-4 py-8 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button className="mt-4" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card size="sm" className="border-white/70 bg-white/85">
      <CardContent className="pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
              {label}
            </div>
            <div className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
              {value}
            </div>
            <div className="text-xs leading-5 text-[var(--color-text-secondary)]">{hint}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
