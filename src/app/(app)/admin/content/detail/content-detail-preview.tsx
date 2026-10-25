import { ChevronLeft, ChevronRight, Monitor, Smartphone, X } from "lucide-react";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useScreenshotGrant } from "@/components/screenshot-grant";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";

export interface ContentDetailPreviewProps {
  previewIndex: number | null;
  activeScreenshots: { label: string; url: string }[];
  aspectRatios: Record<string, number>;
  setPreviewIndex: Dispatch<SetStateAction<number | null>>;
  handleImageLoad: (url: string, ratio: number) => void;
}

export function ContentDetailPreview({ previewIndex, activeScreenshots, aspectRatios, setPreviewIndex, handleImageLoad }: ContentDetailPreviewProps) {
  const { ready: screenshotGrantReady } = useScreenshotGrant();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  if (previewIndex === null || !activeScreenshots[previewIndex] || !screenshotGrantReady || typeof document === "undefined") return null;
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop forceRender className="fixed inset-0 z-[100] bg-[#141413]/85 backdrop-blur-md" />
      <DialogPrimitive.Popup
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 outline-none animate-in fade-in-0 duration-150 select-none"
        onClick={() => setPreviewIndex(null)}
        initialFocus={closeButtonRef}
        finalFocus
        onKeyDown={(event) => {
          if (activeScreenshots.length < 2 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          event.stopPropagation();
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          setPreviewIndex((index) => index === null ? null : (index + delta + activeScreenshots.length) % activeScreenshots.length);
        }}
        aria-label="截图大图预览"
      >
        <DialogPrimitive.Close
          ref={closeButtonRef}
          aria-label="关闭截图预览"
          type="button"
          className="absolute right-5 top-5 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          title="关闭预览 (Esc)"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>

        {activeScreenshots.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : activeScreenshots.length - 1));
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors cursor-pointer"
              title="上一张 (←)"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i !== null && i < activeScreenshots.length - 1 ? i + 1 : 0));
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors cursor-pointer"
              title="下一张 (→)"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}

        <div
          className="relative flex max-h-[calc(100dvh-4.5rem)] max-w-[calc(100vw-2.5rem)] flex-col items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ScreenshotImage
            src={activeScreenshots[previewIndex].url}
            alt={activeScreenshots[previewIndex].label}
            variant="stage"
            placeholderClassName="h-[240px] w-[min(80vw,380px)] rounded-xl border border-white/15 bg-white/10 text-white/80"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                handleImageLoad(activeScreenshots[previewIndex].url, img.naturalWidth / img.naturalHeight);
              }
            }}
            className={`rounded-xl border border-white/15 bg-black object-contain shadow-claude-dialog transition-all duration-150 ${
              (aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15
                ? "max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-3.5rem)] w-auto h-auto"
                : "max-h-[calc(100dvh-6.5rem)] max-w-[min(90vw,560px)] w-auto h-auto"
            }`}
          />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[12px] font-normal text-white shadow-input backdrop-blur-md">
            <span className="flex items-center gap-1">
              {(aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15 ? (
                <Monitor className="size-3.5 text-white/80" />
              ) : (
                <Smartphone className="size-3.5 text-white/80" />
              )}
              <span>{activeScreenshots[previewIndex].label}</span>
              <span className="text-white/60">
                {(aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15 ? "· 电脑端截图" : "· 手机端截图"}
              </span>
            </span>
            {activeScreenshots.length > 1 && (
              <span className="text-white/60 tabular-nums">
                ({previewIndex + 1}/{activeScreenshots.length})
              </span>
            )}
          </div>
        </div>
      </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
