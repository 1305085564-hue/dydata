import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

type BadgeColor = "primary" | "success" | "warning" | "danger" | "neutral";

export function cardClass(hover = true) {
  return cn(
    "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--glass-bg)] shadow-[var(--shadow-card)] backdrop-blur-xl",
    hover ? "glass-card" : "glass-card-static",
  );
}

export function glassClass() {
  return cn(
    "border border-white/60 dark:border-white/10",
    "bg-[var(--glass-bg)] backdrop-blur-[24px] supports-[backdrop-filter]:bg-[var(--glass-bg)]",
    "shadow-[var(--shadow-card)]",
  );
}

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "default") {
  return buttonVariants({ variant, size });
}

export function badgeClass(color: BadgeColor = "neutral") {
  const semanticColorClass = {
    primary: "bg-primary text-primary-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    neutral: "border-border text-foreground bg-background/80",
  } satisfies Record<BadgeColor, string>;

  return cn(badgeVariants({ variant: color === "primary" ? "default" : "outline" }), semanticColorClass[color]);
}
