"use client";

import { Columns2, ChevronDown, Maximize2, ZoomIn } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import { useScreenshotGrant } from "@/components/screenshot-grant";

export interface ContentDetailEvidenceProps {
  activeScreenshots: { label: string; url: string; subLabel: string }[];
  hasWideScreenshot: boolean;
  effectiveLayout: "side-by-side" | "stacked";
  curveScreenshot?: { url: string };
  retentionScreenshot?: { url: string };
  aspectRatios: Record<string, number>;
  handleImageLoad: (url: string, ratio: number) => void;
  handleImageError?: (url: string) => void;
  setPreviewIndex: (index: number) => void;
  setViewLayout: (layout: "auto" | "side-by-side" | "stacked") => void;
}

export function ContentDetailEvidence({ activeScreenshots, hasWideScreenshot, effectiveLayout, curveScreenshot, retentionScreenshot, aspectRatios, handleImageLoad, handleImageError, setPreviewIndex, setViewLayout }: ContentDetailEvidenceProps) {
  const { ready: screenshotGrantReady } = useScreenshotGrant();
  const pending = (
    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] bg-white px-4 text-[12px] text-[#A8A29E]">
      正在准备截图授权…
    </div>
  );
  return (
              <details className="group/details border-t border-[#E2E2DF]/60 pt-5 mt-5" open>
                <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-normal text-[#141413] select-none">
                  <div className="flex items-center gap-2">
                    <span>数据截图证据</span>
                    {activeScreenshots.length > 0 && (
                      <span className="text-[12px] font-normal text-[#78716C]">
                        {hasWideScreenshot ? "（含电脑宽幅，已智能全宽展开）" : "（点击可全屏放大）"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeScreenshots.length > 1 && (
                      <div
                        className="hidden sm:inline-flex items-center rounded-md border border-[#E2E2DF] bg-[#F7F7F6] p-0.5 text-[12px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setViewLayout("side-by-side")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-normal transition-colors cursor-pointer ${
                            effectiveLayout === "side-by-side"
                              ? "bg-white text-[#141413] shadow-input"
                              : "text-[#78716C] hover:text-[#141413]"
                          }`}
                          title="双列左右并排对照"
                        >
                          <Columns2 className="size-3" />
                          双列对照
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewLayout("stacked")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-normal transition-colors cursor-pointer ${
                            effectiveLayout === "stacked"
                              ? "bg-white text-[#141413] shadow-input"
                              : "text-[#78716C] hover:text-[#141413]"
                          }`}
                          title="单列大画幅展开，字迹更大更清晰"
                        >
                          <Maximize2 className="size-3" />
                          单列大图
                        </button>
                      </div>
                    )}
                    <ChevronDown className="size-4 text-[#78716C] transition-[transform,color] duration-150 group-open/details:rotate-180" />
                  </div>
                </summary>

                <div
                  className={`mt-3 ${
                    effectiveLayout === "stacked"
                      ? "flex flex-col gap-5"
                      : "grid gap-4 md:grid-cols-2"
                  }`}
                >
                  <div>
                    <div className="mb-2 flex items-center text-[12px]">
                      <span className="font-normal text-[#1F1E1D]">流量曲线</span>
                    </div>

                    {curveScreenshot && screenshotGrantReady ? (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = activeScreenshots.findIndex((s) => s.url === curveScreenshot.url);
                          if (idx !== -1) setPreviewIndex(idx);
                        }}
                        className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[#E2E2DF] bg-white p-0 text-left transition-colors hover:border-[#78716C]/50 hover:shadow-card-ring focus:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 ${
                          effectiveLayout === "stacked" && (aspectRatios[curveScreenshot.url] ?? 0.5) <= 1.15
                            ? "max-w-[380px] mx-auto"
                            : ""
                        }`}
                        title="点击全屏放大预览"
                      >
                        <ScreenshotImage
                          src={curveScreenshot.url}
                          alt="流量曲线截图"
                          variant="stage"
                          placeholderClassName="min-h-[320px] w-full rounded-xl"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              handleImageLoad(curveScreenshot.url, img.naturalWidth / img.naturalHeight);
                            }
                          }}
                          onError={() => handleImageError?.(curveScreenshot.url)}
                          className={`w-full object-contain ${
                            effectiveLayout === "stacked"
                              ? (aspectRatios[curveScreenshot.url] ?? 0.5) > 1.15
                                ? "max-h-[440px]"
                                : "max-h-[600px]"
                              : "max-h-[540px]"
                          }`}
                        />
                        <div className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md border border-[#E2E2DF] bg-white/95 px-2 py-1 text-[12px] text-[#141413] shadow-claude-float opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <ZoomIn className="size-3.5 text-[#78716C]" />
                          <span>全屏查看</span>
                        </div>
                      </button>
                    ) : curveScreenshot ? pending : (
                      <EmptyState
                        variant="compact"
                        className="min-h-40 rounded-xl border border-dashed border-[#E2E2DF] bg-white px-4 text-[#A8A29E]"
                        title="暂未上传流量曲线截图"
                      />
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center text-[12px]">
                      <span className="font-normal text-[#1F1E1D]">留存脱落</span>
                    </div>

                    {retentionScreenshot && screenshotGrantReady ? (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = activeScreenshots.findIndex((s) => s.url === retentionScreenshot.url);
                          if (idx !== -1) setPreviewIndex(idx);
                        }}
                        className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[#E2E2DF] bg-white p-0 text-left transition-colors hover:border-[#78716C]/50 hover:shadow-card-ring focus:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 ${
                          effectiveLayout === "stacked" && (aspectRatios[retentionScreenshot.url] ?? 0.5) <= 1.15
                            ? "max-w-[380px] mx-auto"
                            : ""
                        }`}
                        title="点击全屏放大预览"
                      >
                        <ScreenshotImage
                          src={retentionScreenshot.url}
                          alt="留存脱落截图"
                          variant="stage"
                          placeholderClassName="min-h-[320px] w-full rounded-xl"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              handleImageLoad(retentionScreenshot.url, img.naturalWidth / img.naturalHeight);
                            }
                          }}
                          onError={() => handleImageError?.(retentionScreenshot.url)}
                          className={`w-full object-contain ${
                            effectiveLayout === "stacked"
                              ? (aspectRatios[retentionScreenshot.url] ?? 0.5) > 1.15
                                ? "max-h-[440px]"
                                : "max-h-[600px]"
                              : "max-h-[540px]"
                          }`}
                        />
                        <div className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md border border-[#E2E2DF] bg-white/95 px-2 py-1 text-[12px] text-[#141413] shadow-claude-float opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <ZoomIn className="size-3.5 text-[#78716C]" />
                          <span>全屏查看</span>
                        </div>
                      </button>
                    ) : retentionScreenshot ? pending : (
                      <EmptyState
                        variant="compact"
                        className="min-h-40 rounded-xl border border-dashed border-[#E2E2DF] bg-white px-4 text-[#A8A29E]"
                        title="暂未上传留存脱落截图"
                      />
                    )}
                  </div>
                </div>
              </details>
  );
}
