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
  probeScreenshotFailureReason,
  type ScreenshotFailureReason,
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

const PLACEHOLDER_LABEL: Record<ScreenshotFailureReason, string> = {
  unavailable: "截图无法显示",
  missing: "原图已丢失",
};
const PLACEHOLDER_HINT: Record<ScreenshotFailureReason, string | null> = {
  unavailable: "点击重试",
  // 原图本体不存在（2026-05 的 384 张），重试多少次都没结果，不给假承诺。
  missing: "文件早已不存在，无法恢复",
};

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
  reason = "unavailable",
  className,
  onClick,
  onKeyDown,
}: {
  alt: string;
  variant?: ScreenshotImageVariant;
  /** 缺失（404，真丢了）还是暂时读不到（网络/服务异常，可以重试） */
  reason?: ScreenshotFailureReason;
  className?: string;
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLSpanElement>) => void;
}) {
  const compact = variant === "thumb";
  const label = PLACEHOLDER_LABEL[reason];
  const hint = PLACEHOLDER_HINT[reason];
  // 原图已丢失时不给可点区域：点了也读不回来。
  const interactive = !compact && reason !== "missing";
  return (
    <span
      data-screenshot-placeholder="1"
      data-screenshot-reason={reason}
      title={`${alt}：${label}`}
      aria-label={`${alt}：${label}`}
      {...(interactive ? { role: "button", tabIndex: 0, onClick, onKeyDown } : {})}
      className={cn(PLACEHOLDER_BASE[variant], className, interactive ? "cursor-pointer" : "")}
    >
      <ImageOff className={compact ? "size-3.5 stroke-[1.5]" : "size-5 stroke-[1.5]"} aria-hidden />
      {compact ? null : (
        <span className="flex flex-col items-start gap-0.5 text-left">
          <span className="text-[12px] leading-tight">{label}</span>
          {hint ? (
            <span className="inline-flex items-center gap-1 text-[12px] leading-tight opacity-80">
              {reason === "missing" ? null : <RefreshCw className="size-3 stroke-[1.8]" aria-hidden />}
              {hint}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

/**
 * 截图专用 <img>：先快速重试一次；占位后有界延后恢复，重新联网也可恢复。
 * 最终占位分两种：服务端明确 404 才说「原图已丢失」，网络/服务异常说「截图无法显示」并保留重试。
 *
 * 只用于截图（`/api/submission-screenshots/file`），不要拿它包封面图之类
 * 语义不同的图片——这里的文案是「截图无法显示 / 原图已丢失」，用错地方会撒谎。
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
  const [reason, setReason] = useState<ScreenshotFailureReason>("unavailable");
  const [attempts, setAttempts] = useState(0);
  // 换 key 强制重建 <img>，这是让浏览器真的重新发一次请求最可靠的方式
  const [renderKey, setRenderKey] = useState(0);
  const [stateSrc, setStateSrc] = useState(src);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 失败后的状态码探测是异步的：回来时图片可能已经换成另一张，只认当前 src。
  const srcRef = useRef(src);
  useEffect(() => {
    srcRef.current = src;
  }, [src]);
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
    setReason("unavailable");
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
      // 只有明确的 404 才说「原图已丢失」；其余按暂时读不到处理，保留重试入口。
      const probing = src;
      void probeScreenshotFailureReason(probing).then((next) => {
        if (srcRef.current !== probing) return;
        setReason(next);
      });
      return;
    }

    setStatus(decision.state.status);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setRenderKey((key) => key + 1);
      setStatus("loading");
    }, SCREENSHOT_RETRY_DELAY_MS);
  }, [attempts, status, clearRetryTimer, src]);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      clearRetryTimer();
      recovery.current?.loaded();
      setAttempts(0);
      setReason("unavailable");
      setStatus("loading");
      onLoad?.(event);
    },
    [clearRetryTimer, onLoad]
  );

  const handleRecovery = useCallback(() => {
    clearRetryTimer();
    setAttempts(0);
    setReason("unavailable");
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
        reason={reason}
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
