import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex w-full items-center gap-2.5 rounded-lg border p-3 text-[13px] leading-relaxed transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[#ECE7DE] bg-[#FAF8F4] text-[#78716C]",
        info:
          "border-[#ECE7DE] bg-[#FAF8F4] text-[#78716C]",
        success:
          "border-[#ECE7DE] bg-[#FAF8F4] text-[#292524]",
        warning:
          "border-[#ECE7DE] bg-[#FAF8F4] text-[#292524]",
        error:
          "border-[#ECE7DE] bg-[#FAF8F4] text-[#292524]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
  showDefaultIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon, showDefaultIcon = true, children, ...props }, ref) => {
    const renderDefaultIcon = () => {
      if (!showDefaultIcon) return null;
      if (icon) return icon;

      switch (variant) {
        case "success":
          return (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D]">
              <CheckCircle2 className="size-3.5 stroke-[2]" />
            </span>
          );
        case "warning":
          return (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#B98A54]/10 text-[#B98A54]">
              <span className="size-1.5 rounded-full bg-[#B98A54]" />
            </span>
          );
        case "error":
          return (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#C0685C]/10 text-[#C0685C]">
              <span className="size-1.5 rounded-full bg-[#C0685C]" />
            </span>
          );
        case "info":
        case "default":
        default:
          return (
            <Info className="size-4 shrink-0 text-[#78716C] stroke-[1.8]" />
          );
      }
    };

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {renderDefaultIcon()}
        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
          {children}
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("font-medium text-[#1C1917] tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[13px] text-[#78716C]", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
