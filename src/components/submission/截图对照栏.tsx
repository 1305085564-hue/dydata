"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import type { SubmissionSlotRole } from "./提交状态机";

/** 宽屏才放对照栏。外框保持 1024、表单 768 靠左（占四分之三）；对照栏 360 + 间距 24 伸进外框右侧的页边留白，需要 (视口 - 1024) / 2 + 768 + 384 + 24 <= 视口，即视口 >= 1328。窄于此不放栏，核对时点截图卡片的小图开检视器 */
export const COMPARE_RAIL_MEDIA_QUERY = "(min-width: 1330px)";

function subscribeRailQuery(onChange: () => void) {
  const media = window.matchMedia(COMPARE_RAIL_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useCompareRailEnabled(): boolean {
  return useSyncExternalStore(
    subscribeRailQuery,
    () => window.matchMedia(COMPARE_RAIL_MEDIA_QUERY).matches,
    () => false,
  );
}

const ROLE_META: Array<{ role: SubmissionSlotRole; label: string }> = [
  { role: "screenshot_1", label: "互动" },
  { role: "screenshot_2", label: "留存" },
];

/** 显示哪张：优先最近聚焦 / 点选的那张；那张没图就退到另一张有图的；都没图返回 null */
export function resolveCompareRole(
  images: Record<SubmissionSlotRole, string | null | undefined>,
  preferred: SubmissionSlotRole | null,
): SubmissionSlotRole | null {
  if (preferred && images[preferred]) return preferred;
  return ROLE_META.find(({ role }) => Boolean(images[role]))?.role ?? null;
}

/**
 * 截图对照栏：宽屏时常驻在表单右侧，吸顶，按聚焦的数字格切换互动 / 留存截图。
 * 常规状态 360px 宽，图片 100% 完整呈现整行指标；
 * 点击放大时视窗展开为 520px 高清大图，图片依然 100% 完整无裁切，按 Esc 或再点一下缩回。
 */
export function ScreenshotCompareRail({
  images,
  preferredRole,
  onSelectRole,
}: {
  images: Record<SubmissionSlotRole, string | null | undefined>;
  preferredRole: SubmissionSlotRole | null;
  onSelectRole: (role: SubmissionSlotRole) => void;
}) {
  const role = resolveCompareRole(images, preferredRole);
  const url = role ? images[role] : null;
  const [zoomed, setZoomed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 换图自动恢复常规尺寸
  useEffect(() => {
    setZoomed(false);
  }, [url]);

  // Esc 键缩回常规尺寸
  useEffect(() => {
    if (!zoomed) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setZoomed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomed]);

  if (!role || !url) return null;
  const available = ROLE_META.filter((item) => Boolean(images[item.role]));

  const toggleZoom = () => {
    setZoomed((prev) => !prev);
  };

  return (
    <aside
      aria-label="截图对照"
      data-testid="screenshot-compare-rail"
      className={cn(
        "sticky top-[calc(var(--app-top-offset,64px)+1rem)] flex h-[calc(100dvh-var(--app-top-offset,64px)-1.5rem)] min-h-[680px] max-h-[960px] flex-col overflow-hidden rounded-xl border border-[#E2E2DF] bg-white transition-all duration-200",
        zoomed
          ? "w-[520px] -translate-x-[160px] z-30 shadow-claude-float ring-1 ring-[#141413]/10"
          : "w-full",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#E2E2DF] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#78716C]">截图对照</span>
          {zoomed ? (
            <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#78716C]">
              大图模式 · 按 Esc 缩回
            </span>
          ) : null}
        </div>
        <div role="tablist" aria-label="切换对照截图" className="flex items-center gap-1">
          {available.map((item) => (
            <button
              key={item.role}
              type="button"
              role="tab"
              aria-selected={item.role === role}
              onClick={() => onSelectRole(item.role)}
              className={cn(
                "h-7 rounded-md px-2 text-[12px] transition-colors cursor-pointer",
                item.role === role ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#141413]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={viewportRef}
        role="button"
        tabIndex={0}
        aria-label={zoomed ? "缩回常规尺寸" : "放大截图查看"}
        title={zoomed ? "点击缩回常规尺寸 (Esc)" : "点击放大看完整大图"}
        onClick={toggleZoom}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleZoom();
          }
        }}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#F1F1F0] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#141413]/20",
          zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
        )}
      >
        <ScreenshotImage
          src={url}
          alt={`${ROLE_META.find((item) => item.role === role)?.label ?? ""}截图对照`}
          variant="stage"
          draggable={false}
          className="block h-auto w-full max-w-none"
          placeholderClassName="min-h-[200px] w-full"
        />
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between border-t border-[#E2E2DF] px-3 text-[12px] text-[#78716C]">
        <span>{zoomed ? "大图视图 · 滚动查看整张" : "点击放大看完整大图"}</span>
        {zoomed ? (
          <button
            type="button"
            onClick={toggleZoom}
            className="text-[12px] text-[#78716C] hover:text-[#141413] hover:underline cursor-pointer"
          >
            缩回常规
          </button>
        ) : null}
      </div>
    </aside>
  );
}

export { ScreenshotCompareRail as 截图对照栏 };
