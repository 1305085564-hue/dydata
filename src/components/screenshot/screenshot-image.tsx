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
import { ImageOff, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createScreenshotRecovery } from "./screenshot-recovery";
import {
  SCREENSHOT_RETRY_DELAY_MS,
  onScreenshotFailureProbed,
  onScreenshotError,
  probeScreenshotFailureReason,
  resolveScreenshotRenderPhase,
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
    "flex h-full min-h-[96px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#F1F1F0] text-[#78716C]",
  stage:
    "flex h-[220px] w-[300px] max-w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#F1F1F0] text-[#78716C]",
};

const PROBING_PLACEHOLDER_BASE: Record<ScreenshotImageVariant, string> = {
  thumb: "flex h-full w-full items-center justify-center overflow-hidden bg-[#F1F1F0] text-[#A8A29E]",
  panel:
    "flex h-full min-h-[96px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#F1F1F0] text-[#A8A29E]",
  stage:
    "flex h-[220px] w-[300px] max-w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#F1F1F0] text-[#A8A29E]",
};

const SKELETON_CROSSFADE_MS = 150;

export function ScreenshotProbingPlaceholder({
  alt,
  variant = "thumb",
  className,
}: {
  alt: string;
  variant?: ScreenshotImageVariant;
  className?: string;
}) {
  const compact = variant === "thumb";
  return (
    <span
      data-screenshot-probing="1"
      role="status"
      aria-label={`${alt}：加载中`}
      className={cn(PROBING_PLACEHOLDER_BASE[variant], className)}
    >
      <span className={cn("inline-flex items-center justify-center animate-pulse-claude", compact ? "" : "gap-2")}>
        <Loader2
          className={cn(compact ? "size-3.5" : "size-4", "animate-spin opacity-70")}
          aria-hidden
        />
        {compact ? null : <span className="text-[12px] leading-tight">加载中…</span>}
      </span>
    </span>
  );
}

export function ScreenshotPlaceholder({
  alt,
  variant = "thumb",
  reason = "unavailable",
  exitingSkeleton = false,
  className,
  onClick,
  onKeyDown,
}: {
  alt: string;
  variant?: ScreenshotImageVariant;
  /** 缺失（404，真丢了）还是暂时读不到（网络/服务异常，可以重试） */
  reason?: ScreenshotFailureReason;
  /** 从骨架切入占位时同步播放 150ms 骨架淡出 */
  exitingSkeleton?: boolean;
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
      className={cn(
        PLACEHOLDER_BASE[variant],
        "relative",
        className,
        interactive ? "cursor-pointer" : "",
      )}
    >
      {exitingSkeleton ? (
        <span
          data-screenshot-probing-exit="1"
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[#A8A29E] animate-out fade-out-0 duration-150"
        >
          <Loader2 className={cn(compact ? "size-3.5" : "size-4", "animate-spin opacity-70")} />
          {compact ? null : <span className="text-[12px] leading-tight">加载中…</span>}
        </span>
      ) : null}
      <span
        className={cn(
          "inline-flex items-center justify-center animate-in fade-in-0 duration-150",
          compact ? "" : "gap-2",
        )}
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
    </span>
  );
}

export interface ScreenshotImageViewProps
  extends Omit<ScreenshotImageProps, "onLoad" | "onError"> {
  status: ScreenshotImageStatus;
  attempts: number;
  reason: ScreenshotFailureReason;
  renderKey: number;
  exitingSkeleton?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onManualRetryClick?: (event: MouseEvent<HTMLSpanElement>) => void;
  onManualRetryKeyDown?: (event: KeyboardEvent<HTMLSpanElement>) => void;
}

/**  纯视图分支：便于单元测试直接验证不同状态机输出与 DOM 接线。 */
export function ScreenshotImageView({
  src,
  alt,
  variant = "thumb",
  status,
  attempts,
  reason,
  renderKey,
  exitingSkeleton = false,
  className,
  placeholderClassName,
  onLoad,
  onError,
  onManualRetryClick,
  onManualRetryKeyDown,
  ...rest
}: ScreenshotImageViewProps) {
  const phase = resolveScreenshotRenderPhase(status, attempts);

  if (phase === "placeholder") {
    return (
      <ScreenshotPlaceholder
        alt={alt}
        variant={variant}
        reason={reason}
        exitingSkeleton={exitingSkeleton}
        className={placeholderClassName}
        onClick={onManualRetryClick}
        onKeyDown={onManualRetryKeyDown}
      />
    );
  }

  if (phase === "skeleton") {
    return (
      <>
        <ScreenshotProbingPlaceholder
          alt={alt}
          variant={variant}
          className={placeholderClassName}
        />
        {status === "loading" ? (
          // 重试在途期间保持骨架稳定展示，隐藏 <img> 负责真正发二次请求。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={renderKey}
            src={src}
            alt=""
            aria-hidden
            className="sr-only pointer-events-none"
            onLoad={onLoad}
            onError={onError}
          />
        ) : null}
      </>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={renderKey}
      src={src}
      alt={alt}
      className={className}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
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
  const [exitingSkeleton, setExitingSkeleton] = useState(false);
  // 换 key 强制重建 <img>，这是让浏览器真的重新发一次请求最可靠的方式
  const [renderKey, setRenderKey] = useState(0);
  const [stateSrc, setStateSrc] = useState(src);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearExitTimer = useCallback(() => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
  }, []);

  // 同一个组件实例可能被不同截图复用（列表换页、切槽位）。
  // 用 render 期重置而不是 effect：effect 里同步 setState 会多一轮级联渲染。
  if (stateSrc !== src) {
    setStateSrc(src);
    setStatus("loading");
    setReason("unavailable");
    setAttempts(0);
    setExitingSkeleton(false);
    setRenderKey(0);
  }

  // src 变化或卸载时丢掉还没触发的自动重试与退场计时，只做清理、不碰状态
  useEffect(() => {
    return () => {
      clearRetryTimer();
      clearExitTimer();
    };
  }, [src, clearRetryTimer, clearExitTimer]);

  const handleError = useCallback(() => {
    const decision = onScreenshotError({ attempts, status });
    setAttempts(decision.state.attempts);
    clearRetryTimer();

    if (!decision.retry) {
      setStatus(decision.state.status);
      // 只有明确的 404 才说「原图已丢失」；在探测完成前保持骨架占位，避免先闪出默认重试占位。
      const probing = src;
      void probeScreenshotFailureReason(probing).then((next) => {
        if (srcRef.current !== probing) return;
        const resolved = onScreenshotFailureProbed(next);
        setReason(resolved.reason);
        setStatus(resolved.status);
        setExitingSkeleton(true);
        clearExitTimer();
        exitTimer.current = setTimeout(() => {
          exitTimer.current = null;
          setExitingSkeleton(false);
        }, SKELETON_CROSSFADE_MS);
        if (next === "unavailable") recovery.current?.failed();
      });
      return;
    }

    setStatus(decision.state.status);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setRenderKey((key) => key + 1);
      setStatus("loading");
    }, SCREENSHOT_RETRY_DELAY_MS);
  }, [attempts, status, clearRetryTimer, clearExitTimer, src]);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      clearRetryTimer();
      clearExitTimer();
      recovery.current?.loaded();
      setAttempts(0);
      setReason("unavailable");
      setExitingSkeleton(false);
      setStatus("loading");
      onLoad?.(event);
    },
    [clearRetryTimer, clearExitTimer, onLoad]
  );

  const handleRecovery = useCallback(() => {
    clearRetryTimer();
    clearExitTimer();
    setAttempts(0);
    setReason("unavailable");
    setExitingSkeleton(false);
    setRenderKey((key) => key + 1);
    setStatus("loading");
  }, [clearRetryTimer, clearExitTimer]);

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

  return (
    <ScreenshotImageView
      src={src}
      alt={alt}
      variant={variant}
      status={status}
      attempts={attempts}
      reason={reason}
      renderKey={renderKey}
      exitingSkeleton={exitingSkeleton}
      className={className}
      placeholderClassName={placeholderClassName}
      onLoad={handleLoad}
      onError={(event) => {
        handleError();
        onError?.(event);
      }}
      onManualRetryClick={handleManualRetryClick}
      onManualRetryKeyDown={handleManualRetryKeyDown}
      {...rest}
    />
  );
}
