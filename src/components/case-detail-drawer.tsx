"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

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
import type { ViolationDetail } from "@/app/(app)/violations/components/types";

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

  useEffect(() => {
    if (!caseId || !open) return;
    let cancelled = false;
    // 异步取数场景：进入后同步切到 loading，再在 fetch 回调里写入数据
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
    // 关闭抽屉时清掉缓存数据，避免下次打开闪现旧内容
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
    }
  }, [open]);

  const handleScreenshotClick = useCallback(
    (paths: string[], index: number) => {
      onOpenLightbox?.(paths, index);
    },
    [onOpenLightbox],
  );

  const isConversion = data?.purpose === "conversion";
  const passRate = data ? getPassRate(data) : null;
  const screenshots = data?.screenshot_paths ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] max-w-[90vw]">
        <SheetHeader>
          <SheetTitle>话术详情</SheetTitle>
        </SheetHeader>

        <SheetBody>
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 w-24 rounded bg-zinc-100" />
              <div className="h-20 rounded bg-zinc-100" />
              <div className="h-12 rounded bg-zinc-100" />
              <div className="h-8 w-32 rounded bg-zinc-100" />
            </div>
          ) : data ? (
            <div className="space-y-5">
              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-2">
                {!isConversion && <UsageStateBadge usageState={data.usage_state} size="lg" />}
                {!isConversion && (
                  <PassRateBadge passCount={data.pass_count} failCount={data.fail_count} />
                )}
                <span className="inline-flex items-center rounded-lg border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  {data.category || "其他"}
                </span>
              </div>

              {/* Script text */}
              <p className="whitespace-pre-wrap text-[16px] font-medium leading-[1.6] text-zinc-800">
                {data.script_text}
              </p>

              {/* Stats */}
              {isConversion ? (
                <div className="grid grid-cols-2 gap-2">
                  <StatBlock label="转化率" value={formatConversionRate(data)} />
                  <StatBlock label="展示" value={formatCount(data.total_views)} />
                  <StatBlock label="涨粉" value={formatCount(data.total_follows)} />
                  <StatBlock label="使用次数" value={formatCount(data.usage_count)} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <StatBlock
                    label="通过率"
                    value={passRate === null ? "—" : `${passRate}%`}
                  />
                  <StatBlock
                    label="测试次数"
                    value={String((data.pass_count ?? 0) + (data.fail_count ?? 0))}
                  />
                </div>
              )}

              {/* Admin conclusion */}
              {data.admin_conclusion && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    管理员结论
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.7] text-zinc-700">
                    {data.admin_conclusion}
                  </p>
                </div>
              )}

              {/* Screenshots */}
              {screenshots.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    截图
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {screenshots.slice(0, 4).map((path, idx) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => handleScreenshotClick(screenshots, idx)}
                        className="group relative size-16 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 transition-all hover:border-zinc-300"
                      >
                        <Image
                          src={`/api/violations/screenshot/${encodeURI(path)}`}
                          alt={`截图 ${idx + 1}`}
                          fill
                          unoptimized
                          sizes="64px"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      </button>
                    ))}
                    {screenshots.length > 4 && (
                      <button
                        type="button"
                        onClick={() => handleScreenshotClick(screenshots, 4)}
                        className="flex size-16 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
                      >
                        +{screenshots.length - 4}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Meta */}
              <div className="space-y-1.5 text-[12px] text-zinc-500">
                <p>
                  <span className="text-zinc-400">提交人 </span>
                  <span className="font-medium text-zinc-700">{getSubmitterName(data)}</span>
                </p>
                <p>
                  <span className="text-zinc-400">时间 </span>
                  <span className="font-medium text-zinc-700">{formatDateTime(data.created_at)}</span>
                </p>
                <p>
                  <span className="text-zinc-400">账号 </span>
                  <span className="font-medium text-zinc-700">{getAccountName(data)}</span>
                </p>
                <p>
                  <span className="text-zinc-400">团队 </span>
                  <span className="font-medium text-zinc-700">{getTeamName(data)}</span>
                </p>
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
            {caseId && (
              <Link
                href={`/violations/${caseId}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
              >
                查看完整详情
                <ArrowRight className="size-3 stroke-[1.5]" />
              </Link>
            )}
            {canManageViolations && data && (
              <button
                type="button"
                onClick={() => onOpenReview?.(data)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
              >
                审批
              </button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-zinc-800">{value}</p>
    </div>
  );
}

function formatCount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("zh-CN").format(n);
}

function formatConversionRate(item: { weighted_conversion_rate?: number | null; total_views?: number | null; total_follows?: number | null }): string {
  const weighted = item.weighted_conversion_rate;
  if (typeof weighted === "number" && Number.isFinite(weighted)) {
    return `${(weighted * 100).toFixed(2)}%`;
  }
  const views = Number(item.total_views ?? 0);
  const follows = Number(item.total_follows ?? 0);
  if (views <= 0) return "0.00%";
  return `${((follows / views) * 100).toFixed(2)}%`;
}
