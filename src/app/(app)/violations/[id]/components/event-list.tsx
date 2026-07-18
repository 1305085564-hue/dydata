"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Calendar, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

export type EventItem = {
  id: string;
  event_type: string;
  occurred_at: string;
  platform_notice: string | null;
  screenshot_paths?: string[] | null;
  suspected_reason?: string | null;
  appeal_status: string;
  appeal_result?: string | null;
  recovered_at?: string | null;
  note?: string | null;
  account_name_snapshot?: string | null;
  account?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
  reporter?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

const EVENT_TYPE_STYLE: Record<string, { borderColor: string; textColor: string; dotColor: string }> = {
  限流: { borderColor: "border-[#D99E55]/30", textColor: "text-[#D99E55]", dotColor: "#D99E55" },
  警告: { borderColor: "border-[#D99E55]/30", textColor: "text-[#D99E55]", dotColor: "#D99E55" },
  删除视频: { borderColor: "border-stone-200", textColor: "text-stone-500", dotColor: "#78716c" },
  封号: { borderColor: "border-[#C9604D]/30", textColor: "text-[#C9604D]", dotColor: "#C9604D" },
  其他: { borderColor: "border-stone-200", textColor: "text-stone-500", dotColor: "#78716c" },
};

const APPEAL_STATUS_STYLE: Record<string, { borderColor: string; textColor: string; dotColor: string }> = {
  申诉成功: { borderColor: "border-[#6FAA7D]/30", textColor: "text-[#6FAA7D]", dotColor: "#6FAA7D" },
  申诉失败: { borderColor: "border-[#C9604D]/30", textColor: "text-[#C9604D]", dotColor: "#C9604D" },
  申诉中: { borderColor: "border-[#5F82A8]/30", textColor: "text-[#5F82A8]", dotColor: "#5F82A8" },
  未申诉: { borderColor: "border-stone-200", textColor: "text-stone-500", dotColor: "#78716c" },
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function EmptyEvents() {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 py-8">
      <EmptyState
        title="暂无违规事件"
        description="这条话术目前没有被平台判违规"
      />
    </div>
  );
}

function PlatformNoticeBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const needsClamp = lines.length > 2 || text.length > 160;

  return (
    <div className="rounded-lg bg-stone-50 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-stone-500" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            平台通知
          </div>
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-stone-700",
              needsClamp && !expanded && "line-clamp-2",
            )}
          >
            {text}
          </p>
          {needsClamp ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-normal text-stone-500 hover:text-stone-700 active:translate-y-0"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {expanded ? "收起" : "展开全文"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScreenshotThumbs({
  paths,
  onOpen,
}: {
  paths: string[];
  onOpen: (path: string) => void;
}) {
  if (!paths.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => onOpen(path)}
          className="group relative size-16 overflow-hidden rounded-lg border border-stone-200 bg-stone-100 transition-colors hover:border-stone-400 active:translate-y-0"
          aria-label="查看截图大图"
        >
          <Image
            src={`/api/violations/screenshot/${encodeURI(path)}`}
            alt="事件截图"
            fill
            unoptimized
            sizes="64px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        </button>
      ))}
    </div>
  );
}

function Lightbox({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 active:translate-y-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="关闭"
        >
          <X className="size-5" />
        </button>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-h-[88vh] w-full max-w-4xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={`/api/violations/screenshot/${encodeURI(path)}`}
            alt="事件截图"
            width={1400}
            height={1400}
            unoptimized
            className="h-auto max-h-[88vh] w-full rounded-xl object-contain"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function EventList({ events }: { events: EventItem[] }) {
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);

  if (!events.length) return <EmptyEvents />;

  return (
    <>
      <motion.ul
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.04 },
          },
        }}
        className="space-y-3"
      >
        {events.map((event) => {
          const account = firstOf(event.account);
          const reporter = firstOf(event.reporter);
          const accountName =
            event.account_name_snapshot?.trim() || account?.name?.trim() || "未关联账号";
          const reporterName = reporter?.name?.trim();
          const eventStyle = EVENT_TYPE_STYLE[event.event_type] ?? EVENT_TYPE_STYLE["其他"];
          const appealStyle = APPEAL_STATUS_STYLE[event.appeal_status] ?? APPEAL_STATUS_STYLE["未申诉"];
          const screenshots = event.screenshot_paths ?? [];

          return (
            <motion.li
              key={event.id}
              variants={{
                hidden: { opacity: 0, y: 6 },
                show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="rounded-xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[12px] font-normal",
                      eventStyle.borderColor,
                      eventStyle.textColor,
                    )}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: eventStyle.dotColor }} />
                    {event.event_type}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] text-stone-500">
                    <Calendar className="size-3.5 text-stone-500" strokeWidth={1.5} />
                    {formatDateTime(event.occurred_at)}
                  </span>
                    <span className="text-stone-500">·</span>
                  <span className="text-[12px] font-normal text-stone-700">{accountName}</span>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[12px] font-normal",
                    appealStyle.borderColor,
                    appealStyle.textColor,
                  )}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: appealStyle.dotColor }} />
                  {event.appeal_status}
                </span>
              </div>

              {event.platform_notice ? (
                <div className="mt-3">
                  <PlatformNoticeBlock text={event.platform_notice} />
                </div>
              ) : null}

              {event.suspected_reason ? (
                <p className="mt-3 text-[12px] leading-6 text-stone-700">
                  <span className="font-normal text-stone-500">疑似原因：</span>
                  {event.suspected_reason}
                </p>
              ) : null}

              {event.appeal_result ? (
                <p className="mt-2 text-[12px] leading-6 text-stone-700">
                  <span className="font-normal text-stone-500">申诉结果：</span>
                  {event.appeal_result}
                </p>
              ) : null}

              {event.recovered_at ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#6FAA7D]/30 px-2 py-0.5 text-[12px] font-normal text-[#6FAA7D]">
                  <RefreshCw className="size-3" strokeWidth={1.5} />
                  恢复于 {formatDateTime(event.recovered_at)}
                </div>
              ) : null}

              <ScreenshotThumbs paths={screenshots} onOpen={setLightboxPath} />

              {event.note ? (
                <p className="mt-3 whitespace-pre-wrap pt-3 text-[12px] leading-6 text-stone-700">
                  {event.note}
                </p>
              ) : null}

              {reporterName ? (
                <div className="mt-3 text-[12px] text-stone-500">上报人 {reporterName}</div>
              ) : null}
            </motion.li>
          );
        })}
      </motion.ul>

      {lightboxPath ? (
        <Lightbox path={lightboxPath} onClose={() => setLightboxPath(null)} />
      ) : null}
    </>
  );
}
