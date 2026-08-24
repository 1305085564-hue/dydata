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
    success: "border-[#E5E0D6] bg-[#FBF9F5] text-[#6FAA7D] dark:border-[#292524] dark:bg-[#1C1917] dark:text-[#6FAA7D]",
    warning: "border-[#E5E0D6] bg-[#FBF9F5] text-[#D99E55] dark:border-[#292524] dark:bg-[#1C1917] dark:text-[#D99E55]",
    danger: "border-[#E5E0D6] bg-[#FBF9F5] text-[#C9604D] dark:border-[#292524] dark:bg-[#1C1917] dark:text-[#C9604D]",
    neutral: "border-border text-foreground bg-background/80",
  } satisfies Record<BadgeColor, string>;

  return cn(badgeVariants({ variant: color === "primary" ? "default" : "outline" }), semanticColorClass[color]);
}
