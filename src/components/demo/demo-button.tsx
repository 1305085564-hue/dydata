"use client";

import { type VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

interface DemoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  actionName?: string;
}

export function DemoButton({
  actionName = "此操作",
  onClick,
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: DemoButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    feedbackToast.warning("演示模式不可操作", {
      description: `${actionName}在演示模式下不可用`,
    });
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(buttonVariants({ variant, size }), "opacity-50", className)}
      {...props}
    >
      {children}
    </button>
  );
}
