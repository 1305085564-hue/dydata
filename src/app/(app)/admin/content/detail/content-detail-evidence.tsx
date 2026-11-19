"use client";

import { ZoomIn } from "lucide-react";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import { useScreenshotGrant } from "@/components/screenshot-grant";

/**
 * 数据截图：流量曲线与留存脱落直接摊开，不折叠、不让人选排法。
 * 有电脑宽图时自动上下排，全是手机竖图时左右并排；点图看大图。
 */
export interface ContentDetailEvidenceProps {
  activeScreenshots: { label: string; url: string; subLabel: string }[];
  stacked: boolean;
  curveScreenshot?: { url: string };
  retentionScreenshot?: { url: string };
  aspectRatios: Record<string, number>;
  handleImageLoad: (url: string, ratio: number) => void;
  handleImageError?: (url: string) => void;
  setPreviewIndex: (index: number) => void;
}

const WIDE_RATIO = 1.15;

export function ContentDetailEvidence({
  activeScreenshots,
  stacked,
  curveScreenshot,
  retentionScreenshot,
  aspectRatios,
  handleImageLoad,
  handleImageError,
  setPreviewIndex,
}: ContentDetailEvidenceProps) {
  const { ready: screenshotGrantReady } = useScreenshotGrant();

  const slots = [
    { key: "curve", label: "流量曲线", shot: curveScreenshot },
    { key: "retention", label: "留存脱落", shot: retentionScreenshot },
  ];

  return (
    <section className="space-y-2">
      <h3 className="text-[14px] text-[#141413]">
        数据截图
        {activeScreenshots.length > 0 && <span className="ml-2 text-[12px] text-[#78716C]">点图看大图</span>}
      </h3>
      <div className={stacked ? "flex flex-col gap-5" : "grid gap-3 md:grid-cols-2"}>
        {slots.map(({ key, label, shot }) => {
          const wide = shot ? (aspectRatios[shot.url] ?? 0.5) > WIDE_RATIO : false;
          return (
            <figure key={key} className="space-y-1">
              <figcaption className="text-[12px] text-[#78716C]">{label}</figcaption>
              {!shot ? (
                <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] px-4 text-[12px] text-[#A8A29E]">
                  还没上传{label}截图
                </div>
              ) : !screenshotGrantReady ? (
                <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] px-4 text-[12px] text-[#A8A29E]">
                  正在准备截图授权…
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`看${label}大图`}
                  onClick={() => {
                    const index = activeScreenshots.findIndex((item) => item.url === shot.url);
                    if (index !== -1) setPreviewIndex(index);
                  }}
                  className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-xl shadow-card-ring bg-white p-0 text-left transition-shadow duration-150 hover:shadow-claude-float focus:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 ${
                    stacked && !wide ? "mx-auto max-w-[380px]" : ""
                  }`}
                >
                  <ScreenshotImage
                    src={shot.url}
                    alt={`${label}截图`}
                    variant="stage"
                    placeholderClassName="min-h-[320px] w-full rounded-xl"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        handleImageLoad(shot.url, img.naturalWidth / img.naturalHeight);
                      }
                    }}
                    onError={() => handleImageError?.(shot.url)}
                    className={`w-full object-contain ${stacked ? (wide ? "max-h-[440px]" : "max-h-[600px]") : "max-h-[540px]"}`}
                  />
                  <span className="pointer-events-none absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-md bg-white/95 text-[#78716C] shadow-claude-float opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <ZoomIn className="size-3.5" aria-hidden />
                  </span>
                </button>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
