"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, Copy, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReviewDecisionPanel } from "@/app/(app)/violations/[id]/components/review-decision-panel";
import { DataEnrichmentPanel } from "@/app/(app)/violations/[id]/components/data-enrichment-panel";
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

interface CaseDetailDialogProps {
  caseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLightbox?: (paths: string[], index: number) => void;
  /** 管理员视角：内嵌 ReviewDecisionPanel */
  showReviewPanel?: boolean;
  isOwner?: boolean;
  /** 审批保存成功后回调（用于关闭 Dialog） */
  onReviewSuccess?: () => void;
}

type DetailRow = ViolationDetail & {
  purpose?: string | null;
  usage_state?: string | null;
  promotion_level?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
  revision_note?: string | null;
  revision_missing_fields?: string[] | null;
};

export function CaseDetailDialog({
  caseId,
  open,
  onOpenChange,
  onOpenLightbox,
  showReviewPanel = false,
  isOwner = false,
  onReviewSuccess,
}: CaseDetailDialogProps) {
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
      setCopied(false);
    }
  }, [open]);

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

  const handleScreenshotClick = useCallback(
    (paths: string[], index: number) => {
      onOpenLightbox?.(paths, index);
    },
    [onOpenLightbox],
  );

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl" showCloseButton={false}>
        <DialogHeader className="sticky top-0 z-10 border-b border-stone-100 bg-white/95 px-6 pt-6 pb-4 backdrop-blur-md">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-[18px] font-medium leading-[1.5] text-stone-900">
                话术详情
              </DialogTitle>
              <p className="mt-1 text-[12px] text-stone-500">
                {showReviewPanel ? "查看详情 · 底部审核" : "复制即用"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              aria-label="关闭"
            >
              <X className="size-4 stroke-[1.75]" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-6 w-32 rounded-md bg-stone-100" />
              <div className="h-24 rounded-xl bg-stone-100" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 rounded-lg bg-stone-100" />
                <div className="h-14 rounded-lg bg-stone-100" />
              </div>
              <div className="h-20 rounded-xl bg-stone-100" />
            </div>
          ) : data ? (
            <>
              {data.status === "needs_revision" && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-[12px] text-amber-800 flex items-start gap-2.5">
                  <AlertTriangle className="size-4.5 text-[#D99E55] shrink-0 mt-0.5" />
                  <div>
                  <p className="text-[#D99E55]">缺失凭证打回中</p>
                    {data.revision_note && <p className="mt-1 text-stone-700">{data.revision_note}</p>}
                  </div>
                </div>
              )}
              <div className="space-y-6 pt-5">
              {/* 标签行 */}
              <div className="flex flex-wrap items-center gap-2">
                {!isConversion && <UsageStateBadge usageState={data.usage_state} size="md" />}
                {!isConversion && (
                  <PassRateBadge passCount={data.pass_count} failCount={data.fail_count} />
                )}
                <span className="inline-flex items-center rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-700">
                  {data.category || "其他"}
                </span>
                {confidence ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[12px]"
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

              {/* 话术全文 + 复制按钮 */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] uppercase tracking-[0.25em] text-stone-500">
                    话术全文
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[12px] transition-all active:translate-y-0",
                      copied
                        ? "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-stone-900",
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
                <p className="whitespace-pre-wrap text-[13px] leading-[1.7] text-stone-700">
                  {data.script_text}
                </p>
              </div>

              {/* 统计指标 */}
              {isConversion ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

              {/* 管理员点评 */}
              {data.admin_conclusion ? (
                <div className="rounded-xl border border-[#D97757]/15 bg-[#D97757]/[0.04] p-4">
                  <p className="text-[12px] uppercase tracking-[0.25em] text-[#D97757]">
                    管理员点评
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.7] text-stone-700">
                    {data.admin_conclusion}
                  </p>
                </div>
              ) : null}

              {/* 截图 */}
              {screenshots.length > 0 ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[12px] uppercase tracking-[0.25em] text-stone-500">
                      截图 · {screenshots.length} 张
                    </p>
                    <button
                      type="button"
                      onClick={() => handleScreenshotClick(screenshots, 0)}
                      className="text-[12px] text-stone-500 transition-colors hover:text-stone-900"
                    >
                      查看大图
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {screenshots.slice(0, 7).map((path, idx) => {
                      const isLast = idx === 6 && screenshots.length > 7;
                      const isHero = idx === 0;
                      return (
                        <button
                          key={path}
                          type="button"
                          onClick={() => handleScreenshotClick(screenshots, idx)}
                          className={cn(
                            "group/thumb relative aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100 transition-all",
                            "hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_8px_20px_-10px_rgba(28,25,23,0.18)]",
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
                            <span className="absolute left-2 top-2 inline-flex items-center rounded bg-black/55 px-1.5 py-0.5 text-[12px] uppercase tracking-wider text-white backdrop-blur-sm">
                              主图
                            </span>
                          ) : null}
                          {isLast ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[13px] text-white">
                              +{screenshots.length - 7}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* 测试明细 */}
              {testRecords.length > 0 ? (
                <div>
                  <p className="text-[12px] uppercase tracking-[0.25em] text-stone-500">
                    多号测试明细 · {testRecords.length} 条
                  </p>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {testRecords.slice(0, 8).map((record) => (
                      <li
                        key={record.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: record.passed ? "#6FAA7D" : "#C9604D",
                            }}
                          />
                          <span className="truncate text-stone-700">
                            {record.account_name_snapshot ?? "未命名账号"}
                          </span>
                        </div>
                        <span
                          className="shrink-0"
                          style={{ color: record.passed ? "#6FAA7D" : "#C9604D" }}
                        >
                          {record.passed ? "通过" : "违规"}
                        </span>
                        <span className="shrink-0 tabular-nums text-stone-500">
                          {formatDateTime(record.tested_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* 元数据 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-stone-200 pt-4 text-[12px] sm:grid-cols-4">
                <MetaRow label="提交人" value={getSubmitterName(data)} />
                <MetaRow label="时间" value={formatDateTime(data.created_at)} />
                <MetaRow label="账号" value={getAccountName(data)} />
                <MetaRow label="团队" value={getTeamName(data)} />
              </div>
            </div>

            {/* 审核决策 — 仅管理工作台，独立于详情内容 */}
            {showReviewPanel ? (
              <div className="-mx-6 mt-6 border-t border-stone-200 bg-stone-50/60 px-6 py-5">
                {isConversion ? (
                  <DataEnrichmentPanel
                    caseId={data.id}
                    caseDetail={data}
                    onProcessed={() => {
                      onReviewSuccess?.();
                      onOpenChange(false);
                    }}
                    onClose={() => onOpenChange(false)}
                  />
                ) : (
                  <>
                    <p className="mb-3 text-[12px] uppercase tracking-[0.25em] text-stone-500">
                      审核决策
                    </p>
                    <ReviewDecisionPanel
                      caseId={data.id}
                      purpose="violation"
                      initialStatus={data.status}
                      initialUsageState={data.usage_state}
                      initialRiskLevel={data.risk_level}
                      initialPromotionLevel={data.promotion_level}
                      initialAdminConclusion={data.admin_conclusion}
                      initialSuggestedAction={data.suggested_action}
                      initialReasonTagIds={[]}
                      isOwner={isOwner}
                      onSuccess={() => {
                        onReviewSuccess?.();
                        onOpenChange(false);
                      }}
                    />
                  </>
                )}
              </div>
            ) : null}
            </>
          ) : (
            <div className="py-10 text-center text-[13px] text-stone-500">
              加载失败或案例不存在
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
        accent ? "border-[#D97757]/20 bg-[#D97757]/[0.03]" : "border-stone-200",
      )}
    >
      <p className="text-[12px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[18px] font-medium tabular-nums",
          accent ? "text-[#D97757]" : "text-stone-900",
        )}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-0.5 text-[12px] text-stone-500">{sublabel}</p>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-stone-500">{label}</span>
      <span className="truncate text-stone-700">{value}</span>
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
