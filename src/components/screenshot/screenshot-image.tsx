"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createScreenshotRecovery } from "./screenshot-recovery";
import {
  SCREENSHOT_RETRY_DELAY_MS,
  onScreenshotError,
  type ScreenshotImageStatus,
} from "./screenshot-image-state";

export type ScreenshotImageVariant = "thumb" | "panel" | "stage";

export interface ScreenshotImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onLoad" | "onError"> {
  src: string;
  alt: string;
  /**
   * thumb：32–44px 缩略图，占位只放图标（放不下文字）
   * panel：96px 以上的中等画框，图标 + 文案横排
   * stage：详情页大图 / 全屏预览
   */
  variant?: ScreenshotImageVariant;
  /** 占位容器额外样式（尺寸、圆角、深色底等），会与默认样式合并 */
  placeholderClassName?: string;
  onLoad?: ImgHTMLAttributes<HTMLImageElement>["onLoad"];
  onError?: ImgHTMLAttributes<HTMLImageElement>["onError"];
}

const PLACEHOLDER_LABEL = "截图无法显示";

const PLACEHOLDER_BASE: Record<ScreenshotImageVariant, string> = {
  thumb: "flex h-full w-full items-center justify-center overflow-hidden bg-[#F1F1F0] text-[#A8A29E]",
  panel:
    "flex h-full min-h-[96px] w-full items-center justify-center gap-1.5 overflow-hidden rounded-md bg-[#F1F1F0] text-[#78716C]",
  stage:
    "flex h-[220px] w-[300px] max-w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#F1F1F0] text-[#78716C]",
};

export function ScreenshotPlaceholder({
  alt,
  variant = "thumb",
  className,
  onClick,
  onKeyDown,
}: {
  alt: string;
  variant?: ScreenshotImageVariant;
  className?: string;
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLSpanElement>) => void;
}) {
  const compact = variant === "thumb";
  return (
    <span
      data-screenshot-placeholder="1"
      title={`${alt}：${PLACEHOLDER_LABEL}`}
      aria-label={`${alt}：${PLACEHOLDER_LABEL}`}
      {...(compact ? {} : { role: "button", tabIndex: 0, onClick, onKeyDown })}
      className={cn(PLACEHOLDER_BASE[variant], className, compact ? "" : "cursor-pointer")}
    >
      <ImageOff className={compact ? "size-3.5 stroke-[1.5]" : "size-5 stroke-[1.5]"} aria-hidden />
      {compact ? null : (
        <span className="flex flex-col items-start gap-0.5 text-left">
          <span className="text-[12px] leading-tight">{PLACEHOLDER_LABEL}</span>
          <span className="inline-flex items-center gap-1 text-[12px] leading-tight opacity-80">
            <RefreshCw className="size-3 stroke-[1.8]" aria-hidden />
            点击重试
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * 截图专用 <img>：先快速重试一次；占位后有界延后恢复，重新联网也可恢复。
 *
 * 只用于截图（`/api/submission-screenshots/file`），不要拿它包封面图之类
 * 语义不同的图片——这里的文案是「截图无法显示」，用错地方会撒谎。
 */
export function ScreenshotImage({
  src,
  alt,
  variant = "thumb",
  className,
  placeholderClassName,
  onLoad,
  onError,
  ...rest
}: ScreenshotImageProps) {
  const [status, setStatus] = useState<ScreenshotImageStatus>("loading");
  const [attempts, setAttempts] = useState(0);
  // 换 key 强制重建 <img>，这是让浏览器真的重新发一次请求最可靠的方式
  const [renderKey, setRenderKey] = useState(0);
  const [stateSrc, setStateSrc] = useState(src);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recovery = useRef<ReturnType<typeof createScreenshotRecovery<ReturnType<typeof setTimeout>>> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  // 同一个组件实例可能被不同截图复用（列表换页、切槽位）。
  // 用 render 期重置而不是 effect：effect 里同步 setState 会多一轮级联渲染。
  if (stateSrc !== src) {
    setStateSrc(src);
    setStatus("loading");
    setAttempts(0);
    setRenderKey(0);
  }

  // src 变化或卸载时丢掉还没触发的自动重试，只做清理、不碰状态
  useEffect(() => clearRetryTimer, [src, clearRetryTimer]);

  const handleError = useCallback(() => {
    const decision = onScreenshotError({ attempts, status });
    setAttempts(decision.state.attempts);
    clearRetryTimer();

    if (!decision.retry) {
      setStatus(decision.state.status);
      recovery.current?.failed();
      return;
    }

    setStatus(decision.state.status);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setRenderKey((key) => key + 1);
      setStatus("loading");
    }, SCREENSHOT_RETRY_DELAY_MS);
  }, [attempts, status, clearRetryTimer]);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      clearRetryTimer();
      recovery.current?.loaded();
      setAttempts(0);
      setStatus("loading");
      onLoad?.(event);
    },
    [clearRetryTimer, onLoad]
  );

  const handleRecovery = useCallback(() => {
    clearRetryTimer();
    setAttempts(0);
    setRenderKey((key) => key + 1);
    setStatus("loading");
  }, [clearRetryTimer]);

  useEffect(() => {
    const controller = createScreenshotRecovery({
      retry: handleRecovery,
      isOnline: () => navigator.onLine,
      schedule: (run, delay) => setTimeout(run, delay),
      cancel: (timer) => clearTimeout(timer),
    });
    recovery.current = controller;
    window.addEventListener("online", controller.online);
    window.addEventListener("offline", controller.offline);
    return () => {
      window.removeEventListener("online", controller.online);
      window.removeEventListener("offline", controller.offline);
      controller.dispose();
      recovery.current = null;
    };
  }, [src, handleRecovery]);

  const handleManualRetry = useCallback(() => {
    recovery.current?.loaded();
    handleRecovery();
  }, [handleRecovery]);

  const handleManualRetryClick = useCallback(
    (event: MouseEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      event.preventDefault();
      handleManualRetry();
    },
    [handleManualRetry]
  );

  const handleManualRetryKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      handleManualRetry();
    },
    [handleManualRetry]
  );

  if (status === "failed") {
    return (
      <ScreenshotPlaceholder
        alt={alt}
        variant={variant}
        className={placeholderClassName}
        onClick={handleManualRetryClick}
        onKeyDown={handleManualRetryKeyDown}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={renderKey}
      src={src}
      alt={alt}
      className={cn(className, status === "retrying" && "opacity-0")}
      onLoad={handleLoad}
      onError={(event) => {
        handleError();
        onError?.(event);
      }}
      {...rest}
    />
  );
}
