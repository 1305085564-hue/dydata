"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AdaptiveSheetProps extends DialogPrimitive.Root.Props {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AdaptiveSheet({ ...props }: AdaptiveSheetProps) {
  return <DialogPrimitive.Root data-slot="adaptive-sheet" {...props} />;
}

export function AdaptiveSheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="adaptive-sheet-trigger" {...props} />;
}

export function AdaptiveSheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="adaptive-sheet-close" {...props} />;
}

export function AdaptiveSheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="adaptive-sheet-portal" {...props} />;
}

export function AdaptiveSheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="adaptive-sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-[#1C1917]/25 backdrop-blur-xs transition-opacity duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

interface AdaptiveSheetContentProps extends DialogPrimitive.Popup.Props {
  showCloseButton?: boolean;
  className?: string;
  children?: React.ReactNode;
  id?: string;
  onDragClose?: () => void;
}

export function AdaptiveSheetContent({
  className,
  children,
  showCloseButton = true,
  id,
  onDragClose,
  ...props
}: AdaptiveSheetContentProps) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > 75) {
      if (onDragClose) {
        onDragClose();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.click();
      }
    }
    setDragOffset(0);
    setIsDragging(false);
    touchStartY.current = null;
  };

  return (
    <AdaptiveSheetPortal>
      <AdaptiveSheetOverlay />
      <DialogPrimitive.Popup
        ref={contentRef}
        id={id}
        data-slot="adaptive-sheet-content"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? "none" : undefined,
        }}
        className={cn(
          // 通用层
          "fixed z-50 flex flex-col bg-[#FBF9F5] text-[13px] text-[#292524] outline-none shadow-claude-dialog duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:duration-0 motion-reduce:transition-none",
          // 移动端：底部抽屉模式 (Bottom Sheet)
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[20px] border-t border-[#E5E0D6] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] px-4 pt-2.5",
          "data-open:animate-in data-open:slide-in-from-bottom-6 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-bottom-6 data-closed:fade-out-0",
          // 桌面端：居中弹窗模式 (Centered Dialog)
          "md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[calc(100dvh-2rem)] md:rounded-2xl md:border md:border-[#E5E0D6] md:p-6 md:pb-6",
          "md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {/* 移动端顶部抓手条 (Pull Handle + 真实手势下拉区域) */}
        <div
          className="flex justify-center py-2 -mt-1 cursor-grab active:cursor-grabbing md:hidden select-none touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="按住向下拉动关闭"
        >
          <span className="h-1.5 w-10 rounded-full bg-[#E5E0D6] hover:bg-[#78716C]/40 transition-colors" aria-hidden="true" />
        </div>

        {children}

        {showCloseButton && (
          <DialogPrimitive.Close
            ref={closeButtonRef}
            data-slot="adaptive-sheet-close"
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-3 right-3 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] min-h-[44px] min-w-[44px]"
              />
            }
          >
            <XIcon className="size-4" />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </AdaptiveSheetPortal>
  );
}

export function AdaptiveSheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="adaptive-sheet-header"
      className={cn("flex flex-col gap-1.5 pb-3 border-b border-[#ECE7DE]/70", className)}
      {...props}
    />
  );
}

export function AdaptiveSheetTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="adaptive-sheet-title"
      className={cn(
        "text-[16px] font-semibold text-[#1C1917] tracking-tight md:text-[18px]",
        className,
      )}
      {...props}
    />
  );
}

export function AdaptiveSheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="adaptive-sheet-description"
      className={cn("text-[12px] text-[#78716C] leading-relaxed", className)}
      {...props}
    />
  );
}

export function AdaptiveSheetBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="adaptive-sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto py-3 space-y-3", className)}
      {...props}
    />
  );
}

export function AdaptiveSheetFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="adaptive-sheet-footer"
      className={cn(
        "flex flex-col-reverse gap-2 pt-3 border-t border-[#ECE7DE]/70 sm:flex-row sm:justify-end sm:gap-3",
        className,
      )}
      {...props}
    />
  );
}
