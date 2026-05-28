"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Copy } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { UsageStateBadge } from "@/app/(app)/violations/components/case-state-badge";
import { PassRateBadge } from "@/app/(app)/violations/components/pass-rate-badge";
import {
  formatDateTime,
  getAccountName,
  getPassRate,
  getSubmitterName,
  getTeamName,
} from "@/app/(app)/violations/components/format";
import type {
  ViolationDetail,
  ViolationTestRecord,
} from "@/app/(app)/violations/components/types";
import { resolveConfidence } from "@/lib/case-library/confidence";
import { cn } from "@/lib/utils";

interface CaseDetailDrawerProps {
  caseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLightbox?: (paths: string[], index: number) => void;
  onOpenReview?: (caseData: ViolationDetail) => void;
  canManageViolations?: boolean;
}

type DetailRow = ViolationDetail & {
  purpose?: string | null;
  usage_state?: string | null;
  promotion_level?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
};

export function CaseDetailDrawer({
  caseId,
  open,
  onOpenChange,
  onOpenLightbox,
  onOpenReview,
  canManageViolations,
}: CaseDetailDrawerProps) {
  const [data, setData] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!caseId || !open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/violations/${caseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const detail = payload?.case ?? payload?.data ?? null;
        setData(detail as DetailRow | null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, open]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCopied(false);
    }
  }, [open]);

  const handleScreenshotClick = useCallback(
    (paths: string[], index: number) => {
      onOpenLightbox?.(paths, index);
    },
    [onOpenLightbox],
  );

  const handleCopy = useCallback(async () => {
    const text = data?.script_text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }, [data]);

  const isConversion = data?.purpose === "conversion";
  const passRate = data ? getPassRate(data) : null;
  const screenshots = data?.screenshot_paths ?? [];
  const testRecords = (data?.test_records ?? data?.violation_test_records ?? []) as ViolationTestRecord[];
  const passedCount = data?.pass_count ?? 0;
  const failedCount = data?.fail_count ?? 0;
  const totalTests = passedCount + failedCount;
  const confidence = (() => {
    if (!isConversion) return null;
    const views = Number(data?.total_views ?? 0);
    return resolveConfidence(views);
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] max-w-[92vw]">
        <SheetHeader>
          <SheetTitle>话术详情</SheetTitle>
        </SheetHeader>

        <SheetBody>
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 w-32 rounded-md bg-zinc-100" />
              <div className="h-24 rounded-xl bg-zinc-100" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 rounded-lg bg-zinc-100" />
                <div className="h-14 rounded-lg bg-zinc-100" />
              </div>
              <div className="h-20 rounded-xl bg-zinc-100" />
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Sticky 话术头部 — 滚动时常驻可见 */}
              <div className="sticky -top-4 z-10 -mx-6 -mt-4 border-b border-zinc-100 bg-white/95 px-6 pb-4 pt-4 backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-2">
                  {!isConversion && <UsageStateBadge usageState={data.usage_state} size="md" />}
                  {!isConversion && (
                    <PassRateBadge passCount={data.pass_count} failCount={data.fail_count} />
                  )}
                  <span className="inline-flex items-center rounded-lg border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    {data.category || "其他"}
                  </span>
                  {confidence ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        borderColor: `${confidence.toneHex}33`,
                        color: confidence.toneHex,
                      }}
                      title={confidence.hint}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: confidence.toneHex }}
                      />
                      {confidence.label}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-[14px] font-medium leading-[1.7] text-zinc-800">
                    {data.script_text}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-all active:translate-y-[1px]",
                      copied
                        ? "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-800",
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 stroke-[2]" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 stroke-[1.75]" />
                        复制
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 完整话术原文（如被 sticky 截断时给完整版） */}
              {data.script_text.length > 140 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    完整话术
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.7] text-zinc-800">
                    {data.script_text}
                  </p>
                </div>
              ) : null}

              {/* Stats */}
              {isConversion ? (
                <div className="grid grid-cols-2 gap-2">
                  <StatBlock label="转化率" value={formatConversionRate(data)} accent />
                  <StatBlock label="使用次数" value={formatCount(data.usage_count)} />
                  <StatBlock label="累计播放" value={formatCount(data.total_views)} />
                  <StatBlock label="累计涨粉" value={formatCount(data.total_follows)} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <StatBlock
                    label="通过率"
                    value={passRate === null ? "—" : `${passRate}%`}
                    accent
                  />
                  <StatBlock
                    label="测试账号"
                    value={String(totalTests)}
                    sublabel={
                      totalTests > 0
                        ? `${passedCount} 通过 · ${failedCount} 违规`
                        : undefined
                    }
                  />
                  <StatBlock label="使用次数" value={formatCount(data.usage_count)} />
                </div>
              )}

              {/* Admin conclusion */}
              {data.admin_conclusion ? (
                <div className="rounded-xl border border-[#D97757]/15 bg-[#D97757]/[0.04] p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#D97757]">
                    管理员点评
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.7] text-zinc-700">
                    {data.admin_conclusion}
                  </p>
                </div>
              ) : null}

              {/* Screenshots — 主图占 2 列，其余小图 */}
              {screenshots.length > 0 ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                      截图 · {screenshots.length} 张
                    </p>
                    <button
                      type="button"
                      onClick={() => handleScreenshotClick(screenshots, 0)}
                      className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-800"
                    >
                      查看大图
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {screenshots.slice(0, 5).map((path, idx) => {
                      const isLast = idx === 4 && screenshots.length > 5;
                      const isHero = idx === 0;
                      return (
                        <button
                          key={path}
                          type="button"
                          onClick={() => handleScreenshotClick(screenshots, idx)}
                          className={cn(
                            "group/thumb relative aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 transition-all",
                            "hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-[0_8px_20px_-10px_rgba(15,23,42,0.18)]",
                            isHero && "col-span-2 row-span-2 aspect-[3/2]",
                          )}
                        >
                          <Image
                            src={`/api/violations/screenshot/${encodeURI(path)}`}
                            alt={`截图 ${idx + 1}`}
                            fill
                            unoptimized
                            sizes={isHero ? "320px" : "160px"}
                            className="object-cover transition-transform group-hover/thumb:scale-[1.04]"
                          />
                          {isHero ? (
                            <span className="absolute left-2 top-2 inline-flex items-center rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                              主图
                            </span>
                          ) : null}
                          {isLast ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[14px] font-semibold text-white">
                              +{screenshots.length - 5}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Test records */}
              {testRecords.length > 0 ? (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    多号测试明细 · {testRecords.length} 条
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {testRecords.slice(0, 6).map((record) => (
                      <li
                        key={record.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2 text-[12px]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: record.passed ? "#6FAA7D" : "#C9604D",
                            }}
                          />
                          <span className="truncate text-zinc-700">
                            {record.account_name_snapshot ?? "未命名账号"}
                          </span>
                        </div>
                        <span
                          className="shrink-0 font-medium"
                          style={{ color: record.passed ? "#6FAA7D" : "#C9604D" }}
                        >
                          {record.passed ? "通过" : "违规"}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">
                          {formatDateTime(record.tested_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Meta */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-zinc-100 pt-4 text-[12px]">
                <MetaRow label="提交人" value={getSubmitterName(data)} />
                <MetaRow label="时间" value={formatDateTime(data.created_at)} />
                <MetaRow label="账号" value={getAccountName(data)} />
                <MetaRow label="团队" value={getTeamName(data)} />
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-zinc-400">
              加载失败或案例不存在
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <div className="flex w-full items-center justify-between gap-2">
            {caseId ? (
              <Link
                href={`/violations/${caseId}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
              >
                查看完整详情
                <ArrowRight className="size-3 stroke-[1.5]" />
              </Link>
            ) : (
              <span />
            )}
            {canManageViolations && data ? (
              <button
                type="button"
                onClick={() => onOpenReview?.(data)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97757] px-3.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-[#C96442] active:translate-y-0"
              >
                审批
              </button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StatBlock({
  label,
  value,
  sublabel,
  accent = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white px-3 py-2.5",
        accent ? "border-[#D97757]/20 bg-[#D97757]/[0.03]" : "border-zinc-100",
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[18px] font-semibold tabular-nums",
          accent ? "text-[#D97757]" : "text-zinc-800",
        )}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-0.5 text-[10px] text-zinc-400">{sublabel}</p>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-zinc-400">{label}</span>
      <span className="truncate font-medium text-zinc-700">{value}</span>
    </p>
  );
}

function formatCount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN").format(n);
}

function formatConversionRate(item: {
  weighted_conversion_rate?: number | null;
  total_views?: number | null;
  total_follows?: number | null;
}): string {
  const weighted = item.weighted_conversion_rate;
  if (typeof weighted === "number" && Number.isFinite(weighted)) {
    return `${(weighted * 100).toFixed(2)}%`;
  }
  const views = Number(item.total_views ?? 0);
  const follows = Number(item.total_follows ?? 0);
  if (views <= 0) return "0.00%";
  return `${((follows / views) * 100).toFixed(2)}%`;
}
