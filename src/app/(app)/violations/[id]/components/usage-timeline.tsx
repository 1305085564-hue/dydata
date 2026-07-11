"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calendar, User2, Eye, UserPlus, Percent } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export type UsageRecordItem = {
  id: string;
  used_at: string;
  views: number | null;
  follows: number | null;
  conversion_rate: number | null;
  source: "daily_report" | "manual" | string;
  note: string | null;
  account_name_snapshot?: string | null;
  account?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
  recorder?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("zh-CN").format(n);
}

function formatRate(value: number | null | undefined, views?: number | null, follows?: number | null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${(value * 100).toFixed(2)}%`;
  }
  const v = Number(views ?? 0);
  const f = Number(follows ?? 0);
  if (v <= 0) return "—";
  return `${((f / v) * 100).toFixed(2)}%`;
}

function SourceChip({ source }: { source: string }) {
  if (source === "daily_report") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-[#D97757]/30 px-2 py-0.5 text-[12px] font-normal text-[#D97757]">
        日报同步
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-normal text-stone-500">
      手动补录
    </span>
  );
}

export function UsageTimeline({ records }: { records: UsageRecordItem[] }) {
  if (!records.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 py-8">
        <EmptyState
          title="还没有使用记录"
          description="日报同步或手动补录后会出现在这里"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[13px] top-2 bottom-2 w-px bg-stone-200" aria-hidden="true" />
      <AnimatePresence initial={false}>
        <motion.ul
          key="timeline"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.04, delayChildren: 0.02 },
            },
          }}
          className="space-y-4"
        >
          {records.map((record) => {
            const account = firstOf(record.account);
            const recorder = firstOf(record.recorder);
            const accountName =
              record.account_name_snapshot?.trim() || account?.name?.trim() || "未关联账号";
            const recorderName = recorder?.name?.trim() || "—";
            return (
              <motion.li
                key={record.id}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="relative pl-10"
              >
                <span
                  className="absolute left-[7px] top-2 flex size-3 items-center justify-center rounded-full border-[3px] border-white bg-[#D97757] shadow-[0_0_0_1px_rgba(217,119,87,0.2)]"
                  aria-hidden="true"
                />
                <div className="rounded-xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[13px] font-normal text-stone-700">
                      <Calendar className="size-3.5 text-stone-500" strokeWidth={1.5} />
                      {formatDate(record.used_at)}
                      <span className="text-stone-500">·</span>
                      <span className="truncate">{accountName}</span>
                    </div>
                    <SourceChip source={record.source} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[12px] text-stone-500">
                    <User2 className="size-3.5 text-stone-500" strokeWidth={1.5} />
                    记录人 {recorderName}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MetricCell
                      icon={<Eye className="size-3.5" strokeWidth={1.5} />}
                      label="展示"
                      value={formatNumber(record.views)}
                    />
                    <MetricCell
                      icon={<UserPlus className="size-3.5" strokeWidth={1.5} />}
                      label="涨粉"
                      value={formatNumber(record.follows)}
                    />
                    <MetricCell
                      icon={<Percent className="size-3.5" strokeWidth={1.5} />}
                      label="转化率"
                      value={formatRate(record.conversion_rate, record.views, record.follows)}
                      accent
                    />
                  </div>
                  {record.note ? (
                    <p className="mt-3 whitespace-pre-wrap pt-3 text-[12px] leading-6 text-stone-700">
                      {record.note}
                    </p>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}

function MetricCell({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <div className="flex items-center gap-1 text-[12px] font-normal text-stone-500">
        <span className={accent ? "text-[#6FAA7D]" : "text-stone-500"}>{icon}</span>
        {label}
      </div>
      <div
        className={
          accent
            ? "mt-0.5 text-[13px] font-medium tracking-tight text-[#6FAA7D] tabular-nums"
            : "mt-0.5 text-[13px] font-normal tracking-tight text-stone-700 tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}
