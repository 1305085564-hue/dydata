import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

type BadgeColor = "primary" | "success" | "warning" | "danger" | "neutral";

export function cardClass(hover = true) {
  return cn(
    "rounded-2xl border border-[var(--color-border)] bg-[var(--glass-bg)] shadow-[var(--shadow-card)] backdrop-blur-xl",
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
    success: "border-stone-200 bg-stone-50 text-[#3F7A4E] dark:border-stone-700 dark:bg-stone-900 dark:text-[#6FAA7D]",
    warning: "border-stone-200 bg-stone-50 text-[#8F641B] dark:border-stone-700 dark:bg-stone-900 dark:text-[#D99E55]",
    danger: "border-stone-200 bg-stone-50 text-[#B24E3E] dark:border-stone-700 dark:bg-stone-900 dark:text-[#D16A58]",
    neutral: "border-border text-foreground bg-background/80",
  } satisfies Record<BadgeColor, string>;

  return cn(badgeVariants({ variant: color === "primary" ? "default" : "outline" }), semanticColorClass[color]);
}
