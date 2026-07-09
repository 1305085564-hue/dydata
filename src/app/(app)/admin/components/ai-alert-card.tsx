"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { Alert } from "@/lib/alert-sources/types";
import { Checkbox } from "@/components/ui/checkbox";

interface AiAlertRowProps {
  alert: Alert;
  checked: boolean;
  onToggle: () => void;
}

export function AiAlertRow({ alert, checked, onToggle }: AiAlertRowProps) {
  const navigate = alert.suggestedActions.find((a) => a.type === "navigate" && a.href) ?? null;
  const primaryEntity = alert.affectedEntities[0];

  const checkbox = (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className="flex items-center"
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} />
    </div>
  );

  const content = (
    <>
      {checkbox}
      <span className="min-w-[80px] truncate text-[13px] font-medium text-stone-800">
        {primaryEntity?.name ?? "—"}
      </span>
      <span className="flex-1 truncate text-[12px] text-stone-500">
        {alert.detail ?? alert.title}
      </span>
      {navigate && (
        <ArrowRight className="size-3.5 text-stone-400 opacity-0 transition duration-150 group-hover:opacity-100" />
      )}
    </>
  );

  if (navigate?.href) {
    return (
      <Link
        href={navigate.href}
        className="active:translate-y-0 group flex h-9 items-center gap-3 px-4 transition hover:bg-stone-50/60"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="group flex h-9 items-center gap-3 px-4 transition hover:bg-stone-50/60">
      {content}
    </div>
  );
}
